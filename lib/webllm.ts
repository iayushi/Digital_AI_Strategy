import * as webllm from "@mlc-ai/web-llm";

// ── Model catalogue ────────────────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  size: string;
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 · 1B",
    size: "~0.9 GB VRAM",
    description: "Most compatible — runs on almost any laptop GPU. Best starting point.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 · 3B",
    size: "~2.3 GB VRAM",
    description: "Recommended. Noticeably better answers; needs a mid-range GPU (~4 GB+).",
  },
  {
    id: "Phi-4-mini-instruct-q4f16_1-MLC",
    label: "Phi 4 Mini · 3.8B",
    size: "~3.4 GB VRAM",
    description: "Strongest reasoning, but heaviest. Requires a capable GPU (~6 GB+).",
  },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

// ── Engine singleton ───────────────────────────────────────────────────────────

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface LoadProgress {
  text: string;
  progress: number; // 0–1
}

let _engine: webllm.MLCEngine | null = null;
let _loadedModelId: string | null = null;
let _status: LoadStatus = "idle";

export function getWebLLMStatus(): LoadStatus {
  return _status;
}

export function getLoadedModelId(): string | null {
  return _loadedModelId;
}

/**
 * Load (or switch to) a Web-LLM model.
 * The model weights are downloaded from HuggingFace on first use and
 * cached in the browser's Cache Storage — subsequent loads are instant.
 */
export async function loadModel(
  modelId: string,
  onProgress: (p: LoadProgress) => void
): Promise<void> {
  if (_loadedModelId === modelId && _status === "ready") return;

  _status = "loading";
  _loadedModelId = null;

  try {
    if (!_engine) {
      _engine = new webllm.MLCEngine();
    }

    _engine.setInitProgressCallback((report: webllm.InitProgressReport) => {
      onProgress({ text: report.text, progress: report.progress });
    });

    await _engine.reload(modelId);
    _loadedModelId = modelId;
    _status = "ready";
  } catch (err) {
    _status = "error";
    // The engine can be left unrecoverable (e.g. the WebGPU device was lost
    // while the tab was backgrounded). Tear it down so the next loadModel()
    // builds a FRESH MLCEngine instead of reusing the broken one — otherwise
    // every "Retry Load" reuses the wedged engine and silently fails again.
    const broken = _engine;
    _engine = null;
    _loadedModelId = null;
    if (broken) {
      // Best-effort GPU teardown; don't await — a wedged device can make
      // unload() hang, and nulling above already guarantees a clean retry.
      Promise.resolve().then(() => broken.unload()).catch(() => {});
    }
    throw err;
  }
}

/**
 * Reset the engine to idle so the Load Model button reappears after a GPU error.
 */
export function resetEngine(): void {
  _engine = null;
  _loadedModelId = null;
  _status = "idle";
}

/**
 * Interrupt any in-flight generation then immediately reset the engine.
 * Calling interruptGenerate() while _engine is still non-null ensures the GPU
 * command is actually sent. We null _engine afterwards so the next loadModel()
 * call creates a fresh MLCEngine rather than reusing the one that was busy —
 * reusing a busy engine (e.g. after a watchdog timeout) causes web-llm to
 * throw "Model not loaded before trying to complete ChatCompletionRequest".
 *
 * We also kick off a best-effort unload() to release the old WebGPU device and
 * its ~GBs of model memory. It is intentionally NOT awaited: after a background
 * suspension the device can be wedged and unload() may hang, but the next
 * loadModel() must not be blocked on it (we already dropped the reference).
 */
export function interruptAndResetEngine(): void {
  const old = _engine;
  _engine = null;
  _loadedModelId = null;
  _status = "idle";
  if (old) {
    try {
      old.interruptGenerate();
    } catch {
      /* ignore */
    }
    Promise.resolve().then(() => old.unload()).catch(() => {});
  }
}

/**
 * Interrupt an in-flight generation without resetting.
 */
export function interruptWebLLM(): void {
  void _engine?.interruptGenerate();
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Stream a chat completion from the loaded Web-LLM model.
 * Calls onToken for each text delta; calls onToken("", true) when finished.
 */
export async function streamWebLLM(
  messages: ChatMessage[],
  onToken: (token: string, done: boolean) => void
): Promise<void> {
  if (!_engine || _status !== "ready") {
    throw new Error("Web-LLM engine not ready — load a model first.");
  }

  const reply = await _engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.7,
    top_p: 0.9,
    // Penalise repetition. Small/instruct models (Llama-3.2-1B, Phi-4-mini) on
    // short or vague questions otherwise fall into degenerate loops, repeating
    // a phrase until max_tokens cuts them off mid-word. See B13.
    frequency_penalty: 0.5,
    presence_penalty: 0.3,
    max_tokens: 1024,
  });

  for await (const chunk of reply) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    const finished = chunk.choices[0]?.finish_reason != null;
    if (delta) onToken(delta, false);
    if (finished) onToken("", true);
  }
}
