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
    size: "~879 MB",
    description: "Most compatible. Lowest VRAM — works on most GPUs.",
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 · 0.5B",
    size: "~945 MB",
    description: "Smallest parameter count. Fast inference.",
  },
  {
    id: "Phi-4-mini-instruct-q4f16_1-MLC",
    label: "Phi 4 Mini",
    size: "~3.4 GB",
    description: "Best reasoning quality. Requires a capable GPU.",
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
    throw err;
  }
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
    max_tokens: 1024,
  });

  for await (const chunk of reply) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    const finished = chunk.choices[0]?.finish_reason != null;
    if (delta) onToken(delta, false);
    if (finished) onToken("", true);
  }
}
