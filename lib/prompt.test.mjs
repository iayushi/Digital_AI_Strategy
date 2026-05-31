/**
 * Node.js test for the grounding prompt (lib/prompt.ts).
 * Mirrors buildPrompt structure and asserts the B13 anti-repetition guidance
 * is present in the system instructions.
 * Usage: node lib/prompt.test.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "prompt.ts"), "utf-8");

let failures = 0;
function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

// B13 layer 3: the system prompt must steer the model away from repetition.
check("prompt forbids repeating sentences/phrases", /[Nn]ever repeat the same sentence or phrase/.test(src));
check("prompt tells the model to stop when done", /When you have answered the question, stop/.test(src));
check("prompt asks for concise answers", /[Bb]e concise/.test(src));

// Structure must still assemble Context + Question.
check("buildPrompt includes Context section", /Context:/.test(src));
check("buildPrompt includes Question section", /Question: \$\{question\}/.test(src));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll prompt checks passed.");
