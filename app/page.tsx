"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Sidebar, { Mode } from "@/components/Sidebar";
import ChatWindow, { Message } from "@/components/ChatWindow";
import SampleQuestions from "@/components/SampleQuestions";
import { SESSIONS, DEFAULT_WEEK, COURSE_NAME } from "@/lib/sessions";
import { CloudProvider } from "@/lib/cloudapi";
import { FreeTrialSession, formatPoints, getFreeTrialSession, loginFreeTrial, logoutFreeTrial, streamFreeTrial } from "@/lib/freetrial";

// sessionStorage key for the opt-in "remember on this device" API key.
// sessionStorage (not localStorage) so it is cleared when the tab closes.
const API_KEY_STORAGE = "dais.cloudApiKey";

export default function Home() {
  // ── Free Trial (server-funded credits) ──────────────────────────────────────
  const [freeTrialSession, setFreeTrialSession] = useState<FreeTrialSession | null>(null);
  const [freeTrialCode, setFreeTrialCode] = useState("");
  const [freeTrialBusy, setFreeTrialBusy] = useState(false);
  const [freeTrialError, setFreeTrialError] = useState<string | null>(null);

  // Restore an existing server session (HttpOnly cookie) on load, if any.
  useEffect(() => {
    getFreeTrialSession().then(setFreeTrialSession).catch(() => {});
  }, []);

  const handleFreeTrialLogin = useCallback(async () => {
    setFreeTrialBusy(true);
    setFreeTrialError(null);
    try {
      const session = await loginFreeTrial(freeTrialCode);
      setFreeTrialSession(session);
      setFreeTrialCode("");
    } catch (err) {
      setFreeTrialError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setFreeTrialBusy(false);
    }
  }, [freeTrialCode]);

  const handleFreeTrialLogout = useCallback(() => {
    logoutFreeTrial();
    setFreeTrialSession(null);
  }, []);

  // ── Session ──────────────────────────────────────────────────────────────────
  const [selectedWeek, setSelectedWeek] = useState(DEFAULT_WEEK);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleWeekChange = useCallback((week: number) => {
    setSelectedWeek(week);
    setMessages([]);
    setSidebarOpen(false); // auto-close drawer on mobile after session change
    import("@/lib/search").then(({ prefetchWeek }) => prefetchWeek(week));
  }, []);

  // ── Mode ─────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("freetrial");

  // Hide first-query latency: prefetch the default week's (small) binary
  // immediately, and warm the larger embedding model during idle time so the
  // user isn't waiting on a ~23 MB download the moment they ask their first
  // question.
  useEffect(() => {
    import("@/lib/search").then(({ prefetchWeek }) => prefetchWeek(DEFAULT_WEEK));

    const warm = () => import("@/lib/embedder").then(({ warmEmbedder }) => warmEmbedder());
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;
    const cic = (
      window as unknown as { cancelIdleCallback?: (id: number) => void }
    ).cancelIdleCallback;
    const id = ric ? ric(warm) : window.setTimeout(warm, 1200);
    return () => {
      if (ric && cic) cic(id);
      else window.clearTimeout(id);
    };
  }, []);

  // ── Cloud API ─────────────────────────────────────────────────────────────────
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>("Groq");
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudModelName, setCloudModelName] = useState("");
  const [rememberApiKey, setRememberApiKey] = useState(false);

  // Opt-in API-key persistence. We use sessionStorage (cleared when the tab
  // closes), never localStorage, so a key can't linger on a shared machine.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(API_KEY_STORAGE); } catch {}
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client hydration of an opt-in remembered key
      setCloudApiKey(saved);
      setRememberApiKey(true);
    }
  }, []);

  const handleCloudApiKeyChange = useCallback((key: string) => {
    setCloudApiKey(key);
    if (!rememberApiKey) return;
    try {
      if (key) sessionStorage.setItem(API_KEY_STORAGE, key);
      else sessionStorage.removeItem(API_KEY_STORAGE);
    } catch {}
  }, [rememberApiKey]);

  const handleRememberApiKeyChange = useCallback((remember: boolean) => {
    setRememberApiKey(remember);
    try {
      if (remember && cloudApiKey) sessionStorage.setItem(API_KEY_STORAGE, cloudApiKey);
      else sessionStorage.removeItem(API_KEY_STORAGE);
    } catch {}
  }, [cloudApiKey]);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamText, setStreamText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const partialRef = useRef("");
  // Incremented on every new submission and on Stop. onToken callbacks check
  // their captured id against the current value; stale callbacks (e.g. from an
  // interruptGenerate() that fired after the next question was already started)
  // are silently dropped.
  const generationIdRef = useRef(0);

  const handleSubmit = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || isStreaming) return;

      // Guards
      if (mode === "cloud" && !cloudApiKey.trim()) {
        alert("Please enter your API key in the sidebar.");
        return;
      }
      if (mode === "freetrial" && !freeTrialSession) {
        alert("Please enter your access code in the sidebar first.");
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: q }]);
      setStreamText("");
      setIsStreaming(true);
      abortRef.current = false;
      partialRef.current = "";
      generationIdRef.current += 1;
      const myGenId = generationIdRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Retrieve relevant chunks — neural embedding with keyword fallback
        let chunks: string[];
        try {
          const { embedQuery } = await import("@/lib/embedder");
          const { searchWeek } = await import("@/lib/search");
          const queryEmbedding = await embedQuery(q);
          chunks = await searchWeek(selectedWeek, queryEmbedding);
        } catch {
          // Neural retrieval failed (embedder import/download or WASM init).
          // Fall back to keyword search; if that also fails, surface a clear,
          // actionable message instead of leaking a raw stack to the user.
          try {
            const { keywordSearch } = await import("@/lib/search");
            chunks = await keywordSearch(selectedWeek, q);
          } catch {
            throw new Error(
              "Couldn't load this session's course materials. Please check your connection and try again."
            );
          }
        }

        let fullResponse = "";
        const onToken = (token: string, done: boolean) => {
          // Drop stale callbacks: from a Stop-triggered interrupt that resolved
          // after the NEXT generation already started, or from any aborted call.
          if (generationIdRef.current !== myGenId || abortRef.current) return;
          if (token) {
            fullResponse += token;
            partialRef.current = fullResponse;
            setStreamText(fullResponse);
          }
          if (done) {
            partialRef.current = "";
            setMessages((prev) => [...prev, { role: "assistant", content: fullResponse }]);
            setStreamText("");
            setIsStreaming(false);
          }
        };

        if (mode === "cloud") {
          const { buildMessages } = await import("@/lib/prompt");
          const { streamCloudChat, validateApiKey } = await import("@/lib/cloudapi");
          if (!validateApiKey(cloudProvider, cloudApiKey)) {
            throw new Error(
              `API key format looks wrong for ${cloudProvider}. Check the sidebar for the expected prefix.`
            );
          }
          await streamCloudChat(cloudProvider, cloudApiKey, cloudModelName, buildMessages(chunks, q), onToken, controller.signal);
        } else {
          // Free Trial — server-funded, credit-metered. The route handler
          // owns the API key and the grounding prompt; we only send the
          // retrieved chunks and the raw question.
          const remainingMicroUsd = await streamFreeTrial(
            selectedWeek,
            q,
            chunks,
            (token) => onToken(token, false),
            controller.signal
          );
          onToken("", true);
          setFreeTrialSession((prev) => (prev ? { ...prev, remainingMicroUsd } : prev));
        }
      } catch (err) {
        // User pressed Stop (fetch/stream aborted) — finalized in handleStop.
        if (abortRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
        setStreamText("");
        setIsStreaming(false);
      }
    },
    [isStreaming, mode, cloudApiKey, cloudProvider, cloudModelName, selectedWeek, freeTrialSession]
  );

  const handleSampleQuestion = useCallback(
    (q: string) => { handleSubmit(q); },
    [handleSubmit]
  );

  const handleStop = () => {
    // Invalidate any in-flight onToken callbacks — including ones that will
    // arrive later when interruptGenerate() resolves asynchronously.
    generationIdRef.current += 1;
    abortRef.current = true;
    abortControllerRef.current?.abort();

    // Keep whatever was generated so far as the assistant's (partial) answer.
    const partial = partialRef.current;
    partialRef.current = "";
    setStreamText("");
    setIsStreaming(false);
    if (partial.trim()) {
      setMessages((prev) => [...prev, { role: "assistant", content: partial }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Don't submit (or clear the textarea) while a response is streaming or
      // when the input is empty — otherwise an Enter keystroke would silently
      // wipe whatever the user has typed.
      if (isStreaming || !inputValue.trim()) return;
      handleSubmit(inputValue);
      setInputValue("");
    }
  };

  const currentSession = SESSIONS.find((s) => s.week === selectedWeek) ?? SESSIONS[0];

  return (
    // h-dvh = dynamic viewport height — correctly handles mobile browser chrome (address bar)
    <div className="flex h-dvh overflow-hidden bg-gray-50">

      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar — fixed drawer on mobile, static column on desktop ── */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 shrink-0 transition-transform duration-200 ease-in-out md:static md:z-auto md:translate-x-0 md:transition-none ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar
          selectedWeek={selectedWeek}
          onWeekChange={handleWeekChange}
          mode={mode}
          onModeChange={setMode}
          cloudProvider={cloudProvider}
          onCloudProviderChange={setCloudProvider}
          cloudApiKey={cloudApiKey}
          onCloudApiKeyChange={handleCloudApiKeyChange}
          rememberApiKey={rememberApiKey}
          onRememberApiKeyChange={handleRememberApiKeyChange}
          cloudModelName={cloudModelName}
          onCloudModelNameChange={setCloudModelName}
          freeTrialSession={freeTrialSession}
          freeTrialCode={freeTrialCode}
          onFreeTrialCodeChange={setFreeTrialCode}
          onFreeTrialLogin={handleFreeTrialLogin}
          onFreeTrialLogout={handleFreeTrialLogout}
          freeTrialBusy={freeTrialBusy}
          freeTrialError={freeTrialError}
          onClearChat={() => setMessages([])}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Session header with hamburger on mobile */}
        <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden -ml-1 p-2 rounded-lg hover:bg-gray-100 text-gray-600 shrink-0"
            aria-label="Open settings"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor">
              <rect width="18" height="2" rx="1"/>
              <rect y="6" width="18" height="2" rx="1"/>
              <rect y="12" width="18" height="2" rx="1"/>
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Course · {COURSE_NAME}</p>
            <h2 className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{currentSession.title}</h2>
          </div>
          {mode === "freetrial" && freeTrialSession && (
            <div className="ml-auto flex items-center gap-3 shrink-0 text-xs">
              <span className="font-medium text-gray-600">
                ⭐ {formatPoints(freeTrialSession.remainingMicroUsd)} left
              </span>
            </div>
          )}
        </div>

        <SampleQuestions session={currentSession} onSelect={handleSampleQuestion} disabled={isStreaming} />

        <ChatWindow messages={messages} streamText={streamText} isStreaming={isStreaming} />

        <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask a question about this week's lecture… (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 leading-relaxed bg-white"
            />
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="shrink-0 rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                aria-label="Stop generating"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => { handleSubmit(inputValue); setInputValue(""); }}
                disabled={!inputValue.trim()}
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
