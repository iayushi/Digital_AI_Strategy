/**
 * Node.js test for the WebLLM model catalogue (lib/webllm.ts).
 * Verifies every MODEL_OPTIONS id exists in @mlc-ai/web-llm's prebuilt config
 * and that the advertised "~X GB VRAM" label matches the SDK's
 * vram_required_MB within a tolerance — so a typo or an SDK upgrade that drops
 * a model is caught at test time instead of failing for a student at runtime.
 * Usage: node lib/model-catalogue.test.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { prebuiltAppConfig } = require("@mlc-ai/web-llm");

const src = readFileSync(join(__dirname, "webllm.ts"), "utf-8");

// Extract the { id, label, size } triples from MODEL_OPTIONS in source.
const optionsBlock = src.slice(src.indexOf("MODEL_OPTIONS"), src.indexOf("DEFAULT_MODEL_ID"));
const ids = [...optionsBlock.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
const sizes = [...optionsBlock.matchAll(/size:\s*"~([\d.]+)\s*GB VRAM"/g)].map((m) => parseFloat(m[1]));

const vramById = new Map(prebuiltAppConfig.model_list.map((m) => [m.model_id, m.vram_required_MB]));

let failures = 0;
function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

check("catalogue is non-empty", ids.length > 0);
check("every option advertises a '~X GB VRAM' size", sizes.length === ids.length);

ids.forEach((id, i) => {
  const vram = vramById.get(id);
  check(`'${id}' exists in prebuilt config`, vram != null);
  if (vram != null && sizes[i] != null) {
    const advertisedMB = sizes[i] * 1024;
    // Allow generous tolerance — labels are rounded for students.
    const ok = Math.abs(advertisedMB - vram) <= 400;
    check(`'${id}' label ~${sizes[i]} GB ≈ actual ${(vram / 1024).toFixed(2)} GB`, ok);
  }
});

// The Qwen2.5-0.5B model should no longer be offered (it needed MORE VRAM than
// Llama-3.2-1B while being weaker — see PR rationale).
check("pointless Qwen2.5-0.5B removed from catalogue", !ids.includes("Qwen2.5-0.5B-Instruct-q4f16_1-MLC"));
// The mid-tier Llama-3.2-3B should be present.
check("mid-tier Llama-3.2-3B added", ids.includes("Llama-3.2-3B-Instruct-q4f16_1-MLC"));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll model-catalogue checks passed.");
