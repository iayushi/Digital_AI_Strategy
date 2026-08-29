"use client";

import { useEffect, useState } from "react";
import { SESSIONS, COURSE_NAME, COURSE_SUBTITLE } from "@/lib/sessions";
import { MODEL_OPTIONS, LoadStatus, LoadProgress } from "@/lib/webllm";
import { CLOUD_PROVIDERS, CloudProvider } from "@/lib/cloudapi";
import { ChromeAIStatus } from "@/lib/chromeai";
import { FreeTrialSession, formatMicroUsd } from "@/lib/freetrial";

export type Mode = "webllm" | "cloud" | "freetrial";
export type BrowserEngine = "webllm" | "chrome";

interface Props {
  selectedWeek: number;
  onWeekChange: (week: number) => void;

  mode: Mode;
  onModeChange: (mode: Mode) => void;

  browserEngine: BrowserEngine;
  onBrowserEngineChange: (e: BrowserEngine) => void;
  chromeAIStatus: ChromeAIStatus;

  webllmModelId: string;
  onWebllmModelChange: (id: string) => void;
  loadStatus: LoadStatus;
  loadProgress: LoadProgress;
  onLoadModel: () => void;

  cloudProvider: CloudProvider;
  onCloudProviderChange: (p: CloudProvider) => void;
  cloudApiKey: string;
  onCloudApiKeyChange: (k: string) => void;
  rememberApiKey: boolean;
  onRememberApiKeyChange: (remember: boolean) => void;
  cloudModelName: string;
  onCloudModelNameChange: (m: string) => void;

  freeTrialSession: FreeTrialSession | null;
  freeTrialCode: string;
  onFreeTrialCodeChange: (code: string) => void;
  onFreeTrialLogin: () => void;
  onFreeTrialLogout: () => void;
  freeTrialBusy: boolean;
  freeTrialError: string | null;

  onClearChat: () => void;
  onClose: () => void;
}

const CHROME_STATUS_LABEL: Record<ChromeAIStatus, { text: string; cls: string }> = {
  checking:        { text: "Checking availability…",        cls: "text-gray-500 bg-gray-50 border-gray-200" },
  ready:           { text: "✓ Gemini Nano ready",           cls: "text-green-700 bg-green-50 border-green-200" },
  "needs-download":{ text: "↓ Model needs to download first", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  unavailable:     { text: "✗ Not available in this browser", cls: "text-red-700 bg-red-50 border-red-200" },
};

export default function Sidebar({
  selectedWeek, onWeekChange,
  mode, onModeChange,
  browserEngine, onBrowserEngineChange, chromeAIStatus,
  webllmModelId, onWebllmModelChange,
  loadStatus, loadProgress, onLoadModel,
  cloudProvider, onCloudProviderChange,
  cloudApiKey, onCloudApiKeyChange,
  rememberApiKey, onRememberApiKeyChange,
  cloudModelName, onCloudModelNameChange,
  freeTrialSession, freeTrialCode, onFreeTrialCodeChange, onFreeTrialLogin, onFreeTrialLogout,
  freeTrialBusy, freeTrialError,
  onClearChat,
  onClose,
}: Props) {
  const providerConfig = CLOUD_PROVIDERS[cloudProvider];
  const modelOption = MODEL_OPTIONS.find((m) => m.id === webllmModelId) ?? MODEL_OPTIONS[0];

  const [hasWebGPU, setHasWebGPU] = useState<boolean | null>(null);
  useEffect(() => { setHasWebGPU("gpu" in navigator); }, []);

  const chromeLabel = CHROME_STATUS_LABEL[chromeAIStatus];
  const chromeAvailable = chromeAIStatus === "ready" || chromeAIStatus === "needs-download";

  return (
    <aside className="h-full bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest">Course</p>
          <h1 className="text-base font-bold text-gray-900 leading-tight mt-0.5">{COURSE_NAME}</h1>
          {COURSE_SUBTITLE && <p className="text-xs text-gray-400 mt-0.5">{COURSE_SUBTITLE}</p>}
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>

      {/* Session selector */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Session</label>
        <select
          value={selectedWeek}
          onChange={(e) => onWeekChange(Number(e.target.value))}
          className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SESSIONS.map((s) => (
            <option key={s.week} value={s.week}>{s.title}</option>
          ))}
        </select>
      </div>

      {/* Mode toggle */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">AI Mode</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => onModeChange("webllm")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === "webllm" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            🧠 Browser AI
          </button>
          <button
            onClick={() => onModeChange("cloud")}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${mode === "cloud" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            ☁️ Cloud API
          </button>
          <button
            onClick={() => onModeChange("freetrial")}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${mode === "freetrial" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            🪙 Free Trial
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {mode === "webllm"
            ? "Runs locally in your browser. Free, private. Keep this tab active while generating."
            : mode === "cloud"
            ? "Your API key is used client-side only."
            : "A small starter credit funded by the course — no key needed until it runs out."}
        </p>
      </div>

      {/* ── Browser AI panel ─────────────────────────────────── */}
      {mode === "webllm" && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-3">

          {/* Mobile device warning — hidden on desktop (md+) */}
          <div className="md:hidden rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-800 leading-snug">
            <p className="font-semibold mb-0.5">📱 Mobile not recommended</p>
            <p>Browser AI needs a desktop GPU. Switch to <strong>Cloud API</strong> mode — Groq is free and works on any device.</p>
          </div>

          {/* Engine sub-toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Engine</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => onBrowserEngineChange("webllm")}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${browserEngine === "webllm" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Web-LLM
              </button>
              <button
                onClick={() => chromeAvailable && onBrowserEngineChange("chrome")}
                disabled={!chromeAvailable}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                  browserEngine === "chrome" ? "bg-blue-600 text-white"
                  : chromeAvailable ? "bg-white text-gray-600 hover:bg-gray-50"
                  : "bg-gray-50 text-gray-300 cursor-not-allowed"
                }`}
                title={chromeAvailable ? "Use Chrome's built-in Gemini Nano" : "Requires Chrome 127+ with AI features enabled"}
              >
                Chrome Built-in
              </button>
            </div>
          </div>

          {/* Web-LLM sub-panel */}
          {browserEngine === "webllm" && (
            <>
              {hasWebGPU === false && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 leading-snug">
                  <p className="font-semibold mb-1">⚠️ WebGPU not available</p>
                  <p>Use <strong>Chrome 113+</strong> or <strong>Edge 113+</strong>, or switch to Cloud API.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Model</label>
                <select
                  value={webllmModelId}
                  onChange={(e) => onWebllmModelChange(e.target.value)}
                  disabled={loadStatus === "loading"}
                  className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} · {m.size}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{modelOption.description}</p>
              </div>

              {loadStatus === "idle" || loadStatus === "error" ? (
                <button
                  onClick={onLoadModel}
                  disabled={hasWebGPU === false}
                  className="w-full py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loadStatus === "error" ? "Retry Load" : "Load Model"}
                </button>
              ) : loadStatus === "loading" ? (
                <div className="space-y-1.5">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round(loadProgress.progress * 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">{loadProgress.text || "Loading…"}</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                  <span>✓</span><span className="font-medium">{modelOption.label} ready</span>
                </div>
              )}
            </>
          )}

          {/* Chrome AI sub-panel */}
          {browserEngine === "chrome" && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs leading-snug ${chromeLabel.cls}`}>
              <p className="font-medium">{chromeLabel.text}</p>
              {chromeAIStatus === "needs-download" && (
                <p className="mt-1 text-amber-600">Open <strong>chrome://flags/#prompt-api-for-gemini-nano</strong> and enable it, then restart Chrome.</p>
              )}
              {chromeAIStatus === "unavailable" && (
                <p className="mt-1">Requires Chrome 127+ with the Prompt API flag enabled. Use Web-LLM or Cloud API instead.</p>
              )}
              {chromeAIStatus === "ready" && (
                <p className="mt-1 text-green-600">No download needed — runs Gemini Nano built into Chrome.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cloud API panel ───────────────────────────────────── */}
      {mode === "cloud" && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Provider</label>
            <select
              value={cloudProvider}
              onChange={(e) => onCloudProviderChange(e.target.value as CloudProvider)}
              className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((p) => (
                <option key={p} value={p}>{CLOUD_PROVIDERS[p].label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              API Key <span className="font-normal normal-case text-gray-400">({providerConfig.keyHint})</span>
            </label>
            <input
              type="password"
              value={cloudApiKey}
              onChange={(e) => onCloudApiKeyChange(e.target.value)}
              placeholder="Paste your API key…"
              className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="mt-2 flex items-start gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberApiKey}
                onChange={(e) => onRememberApiKeyChange(e.target.checked)}
                className="mt-0.5 accent-blue-600"
              />
              <span>
                Remember on this device
                <span className="block text-gray-400">
                  Kept only until you close this tab. Never use on a shared computer.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Model <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={cloudModelName}
              onChange={(e) => onCloudModelNameChange(e.target.value)}
              placeholder={`Default: ${providerConfig.defaultModel}`}
              className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* ── Free Trial panel ──────────────────────────────────── */}
      {mode === "freetrial" && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-3">
          {freeTrialSession ? (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800">
                <p className="font-medium">✓ Logged in as {freeTrialSession.name}</p>
                <p className="mt-1">{formatMicroUsd(freeTrialSession.remainingMicroUsd)} of starter credit left</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 leading-snug">
                <p className="font-medium">Out of credit? Use your own free Claude.ai account</p>
                <p className="mt-1">Claude.ai (free plan) → Settings → Connectors → Add custom connector → paste this URL. Then just chat with Claude normally — it will search this course's content when relevant.</p>
                <input
                  readOnly
                  value={freeTrialSession.mcpUrl}
                  onFocus={(e) => e.target.select()}
                  className="mt-2 w-full text-xs rounded-lg border border-blue-200 bg-white px-2 py-1.5 font-mono text-blue-900"
                />
              </div>
              <button
                onClick={onFreeTrialLogout}
                className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Switch student
              </button>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Access code
              </label>
              <input
                type="text"
                value={freeTrialCode}
                onChange={(e) => onFreeTrialCodeChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onFreeTrialLogin(); }}
                placeholder="Enter the code your instructor gave you"
                disabled={freeTrialBusy}
                className="w-full text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                onClick={onFreeTrialLogin}
                disabled={freeTrialBusy || !freeTrialCode.trim()}
                className="w-full py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {freeTrialBusy ? "Checking…" : "Start Free Trial"}
              </button>
              {freeTrialError && <p className="text-xs text-red-600">{freeTrialError}</p>}
            </>
          )}
        </div>
      )}

      {/* Clear chat */}
      <div className="px-4 py-3">
        <button
          onClick={onClearChat}
          className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Clear Chat
        </button>
      </div>

      <div className="flex-1" />

      {/* AI Warning */}
      <div className="px-4 py-4">
        <div className="border border-red-300 bg-red-50 rounded-lg px-3 py-2.5 text-xs text-red-700 leading-snug">
          ⚠️ This is an AI chatbot. Use caution when interpreting its responses.
        </div>
      </div>
    </aside>
  );
}
