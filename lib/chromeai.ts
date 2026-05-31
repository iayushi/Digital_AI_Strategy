// Chrome Prompt API (window.ai) — built-in Gemini Nano, no download required.
// Available in Chrome 127+ with AI features enabled.
// Spec: https://github.com/webmachinelearning/prompt-api

export type ChromeAIStatus = "checking" | "ready" | "needs-download" | "unavailable";

function getLanguageModel(): unknown {
  if (typeof window === "undefined") return null;
  // Support both the old (window.ai.languageModel) and newer (window.LanguageModel) locations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.ai?.languageModel ?? w.LanguageModel ?? null;
}

export async function getChromeAIStatus(): Promise<ChromeAIStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lm = getLanguageModel() as any;
  if (!lm) return "unavailable";

  try {
    // Current Prompt API (Chrome 129+): LanguageModel.availability()
    //   → "available" | "downloadable" | "downloading" | "unavailable"
    if (typeof lm.availability === "function") {
      const status = await lm.availability();
      if (status === "available") return "ready";
      if (status === "downloadable" || status === "downloading") return "needs-download";
      return "unavailable";
    }

    // Legacy API (Chrome ≤128): capabilities()
    //   → { available: "readily" | "after-download" | "no" }
    if (typeof lm.capabilities === "function") {
      const caps = await lm.capabilities();
      if (caps?.available === "readily") return "ready";
      if (caps?.available === "after-download") return "needs-download";
    }

    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Stream a response from Chrome's built-in Gemini Nano model.
 * Takes a plain string prompt (the full grounding prompt from buildPrompt).
 * Chrome's API returns cumulative text per chunk — we extract deltas here.
 */
export async function streamChromeAI(
  prompt: string,
  onToken: (token: string, done: boolean) => void,
  signal?: AbortSignal
): Promise<void> {
  const lm = getLanguageModel();
  if (!lm) throw new Error("Chrome AI is not available in this browser.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (lm as any).create();

  const stream = session.promptStreaming(
    prompt,
    signal ? { signal } : undefined
  ) as ReadableStream<string>;
  const reader = stream.getReader();
  let prevLength = 0;

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) {
        onToken("", true);
        break;
      }
      // Each value is the FULL accumulated text so far — extract the new delta
      const delta = typeof value === "string" ? value.slice(prevLength) : "";
      prevLength = typeof value === "string" ? value.length : prevLength;
      if (delta) onToken(delta, false);
    }
  } finally {
    reader.releaseLock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).destroy?.();
  }
}
