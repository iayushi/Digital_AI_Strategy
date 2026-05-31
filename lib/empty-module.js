// Empty stand-in for Node-only built-ins (`fs`, `path`, `url`) in the browser
// bundle. @xenova/transformers does `import fs from "fs"` then `Object.keys(fs)`
// at module-eval time; its package.json `browser` field maps these to `false`,
// but Turbopack resolves a `false` mapping to a module whose *default* export is
// `undefined`, so `Object.keys(undefined)` throws and the embedder chunk (which
// the RAG search and the WebLLM flow depend on) fails to load. Aliasing those
// specifiers to this real empty object — only for the browser build — restores
// webpack's behaviour where the default import is `{}`.
module.exports = {};
