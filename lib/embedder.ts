import { pipeline, env } from "@xenova/transformers";

// Always fetch from HuggingFace Hub, never look for local files
env.allowLocalModels = false;

// Force single-threaded ONNX so SharedArrayBuffer is not required.
// This lets the embedder work without Cross-Origin-Embedder-Policy headers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(env as any).backends = (env as any).backends ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(env as any).backends.onnx = (env as any).backends.onnx ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(env as any).backends.onnx.wasm = { ...(env as any).backends.onnx.wasm, numThreads: 1 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbedPipeline = any;

let _pipe: EmbedPipeline | null = null;
let _loading: Promise<EmbedPipeline> | null = null;

function getPipeline(): Promise<EmbedPipeline> {
  if (_pipe) return Promise.resolve(_pipe);
  if (_loading) return _loading;

  _loading = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    quantized: true,
  }).then((p: EmbedPipeline) => {
    _pipe = p;
    _loading = null;
    return p;
  }).catch((err: unknown) => {
    // Reset so the next call can retry rather than returning the same rejection
    _loading = null;
    throw err;
  });

  return _loading;
}

/**
 * Embed a query string using all-MiniLM-L6-v2.
 * Returns a normalized 384-dimensional Float32Array.
 * The model is downloaded once (~23 MB) and cached by the browser.
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  // output.data is a flat Float32Array of length 384
  return output.data as Float32Array;
}

/** Returns true once the embedding model is loaded and ready. */
export function isEmbedderReady(): boolean {
  return _pipe !== null;
}

/** Pre-warm the embedding model (call on page load to hide latency). */
export function warmEmbedder(): void {
  getPipeline().catch(() => {});
}
