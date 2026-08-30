import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: version-2 only. Production (main) stays `output: "export"` — a
  // static site with no server. This branch adds a real credit system that
  // needs a server-side route (holds the Anthropic API key, enforces
  // per-student budgets), so the static export is dropped here.
  turbopack: {
    // @xenova/transformers imports the Node built-ins `fs`/`path`/`url` and reads
    // them with `Object.keys(...)` at module-eval time. Its package `browser`
    // field maps them to `false`, but Turbopack turns that into a module whose
    // default export is `undefined`, so `Object.keys(undefined)` throws and the
    // embedder bundle (used by client-side RAG search) never loads.
    // Alias them to a real empty object for the browser build to fix the crash.
    resolveAlias: {
      fs: { browser: "./lib/empty-module.js" },
      path: { browser: "./lib/empty-module.js" },
      url: { browser: "./lib/empty-module.js" },
    },
  },
};

export default nextConfig;
