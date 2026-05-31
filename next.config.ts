import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    // @xenova/transformers imports the Node built-ins `fs`/`path`/`url` and reads
    // them with `Object.keys(...)` at module-eval time. Its package `browser`
    // field maps them to `false`, but Turbopack turns that into a module whose
    // default export is `undefined`, so `Object.keys(undefined)` throws and the
    // embedder bundle (used by RAG search and the WebLLM flow) never loads.
    // Alias them to a real empty object for the browser build to fix the crash.
    resolveAlias: {
      fs: { browser: "./lib/empty-module.js" },
      path: { browser: "./lib/empty-module.js" },
      url: { browser: "./lib/empty-module.js" },
    },
  },
};

export default nextConfig;
