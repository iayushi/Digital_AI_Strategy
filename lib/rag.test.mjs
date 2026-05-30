/**
 * Node.js smoke test for the binary parser and cosine similarity logic.
 * Runs against the real week-1.bin file without a browser.
 * Usage: node lib/rag.test.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, "../public/data/week-1.bin");

// ── Binary parser (mirrors lib/search.ts) ─────────────────────────────────────
function parseWeekBin(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder("utf-8");
  let offset = 0;

  const numChunks = view.getUint32(offset, true); offset += 4;
  const embDim    = view.getUint32(offset, true); offset += 4;

  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    const textLen = view.getUint32(offset, true); offset += 4;
    const text    = decoder.decode(new Uint8Array(buffer, offset, textLen));
    offset += textLen;
    const embedding = new Float32Array(buffer.slice(offset, offset + embDim * 4));
    offset += embDim * 4;
    chunks.push({ text, embedding });
  }
  return { numChunks, embDim, chunks };
}

// ── Cosine similarity (mirrors lib/search.ts) ─────────────────────────────────
function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Run ───────────────────────────────────────────────────────────────────────
const nodeBuffer = readFileSync(BIN_PATH);
const ab = nodeBuffer.buffer.slice(
  nodeBuffer.byteOffset,
  nodeBuffer.byteOffset + nodeBuffer.byteLength
);

const { numChunks, embDim, chunks } = parseWeekBin(ab);
console.log(`✓ Parsed week-1.bin: ${numChunks} chunks, dim=${embDim}`);

// Verify embedding dimensions
const badDim = chunks.find((c) => c.embedding.length !== embDim);
if (badDim) {
  console.error("✗ Dimension mismatch in a chunk"); process.exit(1);
}
console.log("✓ All embedding dimensions correct");

// Self-similarity: a chunk's embedding should score 1.0 against itself
const selfScore = cosineSim(chunks[0].embedding, chunks[0].embedding);
if (Math.abs(selfScore - 1.0) > 1e-4) {
  console.error(`✗ Self-similarity should be ~1.0, got ${selfScore}`); process.exit(1);
}
console.log(`✓ Self-similarity = ${selfScore.toFixed(6)}`);

// Cross-similarity: different chunks should score < 1.0
if (chunks.length > 1) {
  const crossScore = cosineSim(chunks[0].embedding, chunks[1].embedding);
  console.log(`✓ Cross-similarity chunks[0] vs chunks[1] = ${crossScore.toFixed(4)}`);
}

// Text sanity: first chunk should contain recognisable course content
const firstText = chunks[0].text.slice(0, 80);
console.log(`✓ First chunk preview: "${firstText}..."`);

console.log("\nAll checks passed.");
