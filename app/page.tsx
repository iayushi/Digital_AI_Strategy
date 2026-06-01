"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Sidebar, { Mode, BrowserEngine } from "@/components/Sidebar";
import ChatWindow, { Message } from "@/components/ChatWindow";
import SampleQuestions from "@/components/SampleQuestions";
import { SESSIONS, DEFAULT_WEEK, COURSE_NAME } from "@/lib/sessions";
import { LoadStatus, LoadProgress, DEFAULT_MODEL_ID } from "@/lib/webllm";
import { CloudProvider } from "@/lib/cloudapi";
import { ChromeAIStatus } from "@/lib/chromeai";

// sessionStorage key for the opt-in "remember on this device" API key.
// sessionStorage (not localStorage) so it is cleared when the tab closes.
const API_KEY_STORAGE = "dais.cloudApiKey";

// Only treat genuine hardware/driver failures as GPU errors.
// State errors ("not loaded", "engine not ready") must NOT call resetEngine()
// because the engine is still valid — the user just needs to wait or retry.
function isGPUError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("mapasync") ||
    m.includes("device lost") ||
    m.includes("webgpu") ||
    m.includes("shader") ||
    // GPU OOM / general hardware failure — only when "gpu" appears with an error/failure word
    (m.includes("gpu") && (m.includes("error") || m.includes("fail") || m.includes("memory") || m.includes("lost")))
  );
}

// Interrupt the WebLLM engine if one is active.
// Dynamic import keeps the heavy bundle out of the initial load.
function interruptActiveEngine(): void {
  import("@/lib/webllm").then(({ interruptWebLLM }) => interruptWebLLM()).catch(() => {});
}

export default function Home() {
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
  const [mode, setMode] = useState<Mode>("webllm");
  const [browserEngine, setBrowserEngine] = useState<BrowserEngine>("webllm");
  const [chromeAIStatus, setChromeAIStatus] = useState<ChromeAIStatus>("checking");

  useEffect(() => {
    import("@/lib/chromeai").then(({ getChromeAIStatus }) =>
      getChromeAIStatus().then(setChromeAIStatus)
    );
  }, []);

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

  // ── Web-LLM ──────────────────────────────────────────────────────────────────
  const [webllmModelId, setWebllmModelId] = useState(DEFAULT_MODEL_ID);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({ text: "", progress: 0 });

  const handleLoadModel = useCallback(async () => {
    setLoadStatus("loading");
    setLoadProgress({ text: "Initialising…", progress: 0 });
    try {
      const { loadModel } = await import("@/lib/webllm");
      await loadModel(webllmModelId, (p) => setLoadProgress(p));
      setLoadStatus("ready");
    } catch (err) {
      setLoadStatus("error");
      console.error("Web-LLM load error:", err);
    }
  }, [webllmModelId]);

  const handleWebllmModelChange = useCallback((id: string) => {
    setWebllmModelId(id);
    setLoadStatus("idle");
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
  const [tabSwitchWarning, setTabSwitchWarning] = useState(false);
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
      if (mode === "webllm" && browserEngine === "webllm" && loadStatus !== "ready") {
        alert("Please load a browser AI model first using the sidebar.");
        return;
      }
      if (mode === "webllm" && browserEngine === "chrome" && chromeAIStatus !== "ready") {
        alert("Chrome AI is not ready. Make sure you're on Chrome 127+ with AI features enabled.");
        return;
      }
      if (mode === "cloud" && !cloudApiKey.trim()) {
        alert("Please enter your API key in the sidebar.");
        return;
      }

      setTabSwitchWarning(false);
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

        if (mode === "webllm" && browserEngine === "chrome") {
          // Chrome AI takes a plain string prompt
          const { buildPrompt } = await import("@/lib/prompt");
          const { streamChromeAI } = await import("@/lib/chromeai");
          await streamChromeAI(buildPrompt(chunks, q), onToken, controller.signal);
        } else if (mode === "webllm") {
          const { buildMessages } = await import("@/lib/prompt");
          const { streamWebLLM } = await import("@/lib/webllm");

          // Track tab visibility during streaming — WebGPU is suspended when
          // the tab is hidden, causing the inference to fail.
          let tabHiddenDuringStream = false;
          const trackVisibility = () => { if (document.hidden) tabHiddenDuringStream = true; };
          document.addEventListener("visibilitychange", trackVisibility);

          try {
            // Watchdog: guards against a truly silent stall (tab backgrounded
            // with WebGPU suspended and no error thrown). 90 s gives ample time
            // for first-token generation even on slow/integrated GPUs.
            // IMPORTANT: when the watchdog fires it also interrupts the engine so
            // the abandoned streamWebLLM promise doesn't keep running as a zombie
            // (a zombie that then conflicts with the next reload/generation).
            const STALL_MS = 90_000;
            let lastActivity = Date.now();
            const webllmOnToken = (token: string, done: boolean) => {
              lastActivity = Date.now();
              onToken(token, done);
            };
            await new Promise<void>((resolve, reject) => {
              const watchdog = setInterval(() => {
                if (Date.now() - lastActivity > STALL_MS) {
                  clearInterval(watchdog);
                  // Kill the zombie generation before rejecting so the engine is
                  // free for subsequent reload/generation attempts.
                  interruptActiveEngine();
                  reject(
                    new Error("__stall__")
                  );
                }
              }, 5000);
              streamWebLLM(buildMessages(chunks, q), webllmOnToken)
                .then(() => {
                  clearInterval(watchdog);
                  resolve();
                })
                .catch((e) => {
                  clearInterval(watchdog);
                  reject(e);
                });
            });
          } catch (webllmErr) {
            document.removeEventListener("visibilitychange", trackVisibility);

            // User pressed Stop — partial was already finalized in handleStop.
            if (abortRef.current) return;

            if (tabHiddenDuringStream) {
              // Tab was switched — restore question to input silently.
              abortRef.current = true;
              setMessages((prev) => prev.slice(0, -1));
              setInputValue(q);
              setStreamText("");
              setIsStreaming(false);
              setTabSwitchWarning(true);
              return;
            }

            const errMsg = webllmErr instanceof Error ? webllmErr.message : String(webllmErr);

            // Watchdog stall — model is loaded but generation produced nothing
            // for 90 s. The engine has been interrupted; the user can try again.
            if (errMsg === "__stall__") {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "⚠️ No response after 90 seconds. The on-device model may be under heavy load or the GPU context was paused.\n\n**Try one of these:**\n• Ask the question again — subsequent generations are usually faster\n• Switch to **Cloud API** mode (Groq is free and responds in seconds)",
                },
              ]);
              setStreamText("");
              setIsStreaming(false);
              return;
            }

            // web-llm engine state error — the model needs a reload.
            // Caused by: zombie generation conflicting with a reload, or the
            // WebGPU context being invalidated without a hardware GPU error.
            if (
              errMsg.toLowerCase().includes("mlcengine") ||
              errMsg.toLowerCase().includes("createmlcengine") ||
              errMsg.toLowerCase().includes("not loaded before") ||
              errMsg.toLowerCase().includes("initialize your engine")
            ) {
              const { resetEngine } = await import("@/lib/webllm");
              resetEngine();
              setLoadStatus("idle");
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "⚠️ The browser AI engine lost its state. Press **Load Model** in the sidebar to reload it, then try again.",
                },
              ]);
              setStreamText("");
              setIsStreaming(false);
              return;
            }

            if (isGPUError(errMsg)) {
              // GPU/WebGPU hardware failure — common on mobile and low-VRAM devices.
              const { resetEngine } = await import("@/lib/webllm");
              resetEngine();
              setLoadStatus("idle");
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "⚠️ Your device's GPU couldn't run the AI model — this is common on mobile phones and tablets.\n\nSwitch to **Cloud API** mode instead. Groq is free (no credit card needed) and very fast.",
                },
              ]);
              setStreamText("");
              setIsStreaming(false);
              return;
            }

            throw webllmErr; // unrecognised error — let outer catch show it
          } finally {
            document.removeEventListener("visibilitychange", trackVisibility);
          }
        } else {
          const { buildMessages } = await import("@/lib/prompt");
          const { streamCloudChat, validateApiKey } = await import("@/lib/cloudapi");
          if (!validateApiKey(cloudProvider, cloudApiKey)) {
            throw new Error(
              `API key format looks wrong for ${cloudProvider}. Check the sidebar for the expected prefix.`
            );
          }
          await streamCloudChat(cloudProvider, cloudApiKey, cloudModelName, buildMessages(chunks, q), onToken, controller.signal);
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
    [isStreaming, mode, browserEngine, loadStatus, chromeAIStatus, cloudApiKey, cloudProvider, cloudModelName, selectedWeek]
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
    interruptActiveEngine();

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
          browserEngine={browserEngine}
          onBrowserEngineChange={setBrowserEngine}
          chromeAIStatus={chromeAIStatus}
          webllmModelId={webllmModelId}
          onWebllmModelChange={handleWebllmModelChange}
          loadStatus={loadStatus}
          loadProgress={loadProgress}
          onLoadModel={handleLoadModel}
          cloudProvider={cloudProvider}
          onCloudProviderChange={setCloudProvider}
          cloudApiKey={cloudApiKey}
          onCloudApiKeyChange={handleCloudApiKeyChange}
          rememberApiKey={rememberApiKey}
          onRememberApiKeyChange={handleRememberApiKeyChange}
          cloudModelName={cloudModelName}
          onCloudModelNameChange={setCloudModelName}
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
        </div>

        <SampleQuestions session={currentSession} onSelect={handleSampleQuestion} disabled={isStreaming} />

        <ChatWindow messages={messages} streamText={streamText} isStreaming={isStreaming} />

        {/* Tab-switch warning banner — only shown after a Web-LLM tab-switch interruption */}
        {tabSwitchWarning && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between shrink-0">
            <p className="text-xs text-amber-800 leading-snug">
              ⚠️ <strong>Generation stopped</strong> — the browser paused AI when you left this tab.
              Your question is ready below. Press <strong>Send</strong> to try again.
            </p>
            <button
              onClick={() => setTabSwitchWarning(false)}
              className="ml-3 shrink-0 text-amber-500 hover:text-amber-700 text-sm leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

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
