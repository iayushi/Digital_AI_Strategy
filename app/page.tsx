"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Detect WebGPU / GPU errors from web-llm — these happen on mobile devices
// and low-VRAM GPUs that can't sustain inference after the model loads.
function isGPUError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("gpu") || m.includes("mapasync") || m.includes("device lost") ||
    m.includes("not loaded") || m.includes("mlcengine") ||
    m.includes("initialize your engine") || m.includes("createmlcengine") ||
    m.includes("webgpu") || m.includes("buffer") || m.includes("shader")
  );
}
import Sidebar, { Mode, BrowserEngine } from "@/components/Sidebar";
import ChatWindow, { Message } from "@/components/ChatWindow";
import SampleQuestions from "@/components/SampleQuestions";
import { SESSIONS, DEFAULT_WEEK, COURSE_NAME } from "@/lib/sessions";
import { LoadStatus, LoadProgress, DEFAULT_MODEL_ID } from "@/lib/webllm";
import { CloudProvider } from "@/lib/cloudapi";
import { ChromeAIStatus } from "@/lib/chromeai";

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

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamText, setStreamText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [tabSwitchWarning, setTabSwitchWarning] = useState(false);
  const abortRef = useRef(false);

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

      try {
        // Retrieve relevant chunks — neural embedding with keyword fallback
        let chunks: string[];
        try {
          const { embedQuery } = await import("@/lib/embedder");
          const { searchWeek } = await import("@/lib/search");
          const queryEmbedding = await embedQuery(q);
          chunks = await searchWeek(selectedWeek, queryEmbedding);
        } catch {
          const { keywordSearch } = await import("@/lib/search");
          chunks = await keywordSearch(selectedWeek, q);
        }

        let fullResponse = "";
        const onToken = (token: string, done: boolean) => {
          if (abortRef.current) return;
          if (token) {
            fullResponse += token;
            setStreamText(fullResponse);
          }
          if (done) {
            setMessages((prev) => [...prev, { role: "assistant", content: fullResponse }]);
            setStreamText("");
            setIsStreaming(false);
          }
        };

        if (mode === "webllm" && browserEngine === "chrome") {
          // Chrome AI takes a plain string prompt
          const { buildPrompt } = await import("@/lib/prompt");
          const { streamChromeAI } = await import("@/lib/chromeai");
          await streamChromeAI(buildPrompt(chunks, q), onToken);
        } else if (mode === "webllm") {
          const { buildMessages } = await import("@/lib/prompt");
          const { streamWebLLM } = await import("@/lib/webllm");

          // Track tab visibility during streaming — WebGPU is suspended when
          // the tab is hidden, causing the inference to fail.
          let tabHiddenDuringStream = false;
          const trackVisibility = () => { if (document.hidden) tabHiddenDuringStream = true; };
          document.addEventListener("visibilitychange", trackVisibility);

          try {
            await streamWebLLM(buildMessages(chunks, q), onToken);
          } catch (webllmErr) {
            document.removeEventListener("visibilitychange", trackVisibility);

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
            if (isGPUError(errMsg)) {
              // GPU/WebGPU failure — common on mobile and low-VRAM devices.
              // Reset the engine so the Load Model button reappears.
              const { resetEngine } = await import("@/lib/webllm");
              resetEngine();
              setLoadStatus("idle");
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "⚠️ Your device's GPU couldn't run the AI model — this is common on mobile phones and tablets.\n\nSwitch to Cloud API mode instead. Groq is free (no credit card needed) and very fast.",
                },
              ]);
              setStreamText("");
              setIsStreaming(false);
              return;
            }

            throw webllmErr; // non-GPU error — let outer catch handle it
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
          await streamCloudChat(cloudProvider, cloudApiKey, cloudModelName, buildMessages(chunks, q), onToken);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
        setStreamText("");
        setIsStreaming(false);
      }
    },
    [isStreaming, mode, browserEngine, loadStatus, chromeAIStatus, cloudApiKey, cloudProvider, cloudModelName, selectedWeek]
  );

  const handleSampleQuestion = useCallback(
    (q: string) => { setInputValue(q); handleSubmit(q); },
    [handleSubmit]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
          onCloudApiKeyChange={setCloudApiKey}
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
            <button
              onClick={() => { handleSubmit(inputValue); setInputValue(""); }}
              disabled={isStreaming || !inputValue.trim()}
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isStreaming ? "…" : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
