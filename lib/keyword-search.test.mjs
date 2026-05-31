// Test the B3 keywordSearch term-extraction + whole-word scoring against real bins.
// Mirrors the logic in lib/search.ts (kept in sync manually since there's no TS test runner).
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "public", "data");

function parseWeekBin(buffer) {
  const view = new DataView(buffer);
  const dec = new TextDecoder("utf-8");
  let o = 0;
  const n = view.getUint32(o, true); o += 4;
  const d = view.getUint32(o, true); o += 4;
  const chunks = [];
  for (let i = 0; i < n; i++) {
    const tl = view.getUint32(o, true); o += 4;
    const text = dec.decode(new Uint8Array(buffer, o, tl)); o += tl;
    o += d * 4;
    chunks.push(text);
  }
  return chunks;
}
function load(week) {
  const buf = readFileSync(join(DATA, `week-${week}.bin`));
  return parseWeekBin(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const STOPWORDS = new Set([
  "a","an","and","the","or","of","to","in","on","is","it","as","at","by","be","do","if","so","we","i",
  "for","are","was","with","that","this","from","you","your","what","how","why","who","when","where",
  "which","does","did","can","will","would","should","could","into","its","their","they","them","then",
  "than","but","not","all","any","our","out","use","about","over","more","most","some","such","have",
  "has","had","were","been","being","while","also","explain","please",
]);
function extractTerms(query) {
  const terms = new Set();
  for (const tok of query.split(/\W+/)) {
    if (!tok) continue;
    const lower = tok.toLowerCase();
    const isAcronym = tok.length >= 2 && /^[A-Z0-9]+$/.test(tok);
    if (isAcronym) { terms.add(lower); continue; }
    if (lower.length > 2 && !STOPWORDS.has(lower)) terms.add(lower);
  }
  return terms;
}
function keywordSearch(chunks, query, topK = 5) {
  let terms = extractTerms(query);
  if (terms.size === 0) {
    terms = new Set();
    for (const tok of query.toLowerCase().split(/\W+/)) if (tok.length > 1) terms.add(tok);
  }
  const scored = chunks.map((c) => {
    const words = new Set(c.toLowerCase().split(/\W+/));
    let score = 0;
    for (const w of terms) if (words.has(w)) score++;
    return { text: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { terms, top: scored.slice(0, topK) };
}

let fail = 0;
function check(name, cond) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fail++;
}

// ── Term extraction: acronyms preserved, stopwords dropped ──
const termCases = [
  ["What is BPR?",            ["bpr"],                 ["what", "is"]],
  ["Explain AI and IT",       ["ai", "it"],            ["and", "explain"]],
  ["MD Anderson Watson",      ["md", "anderson", "watson"], []],
  ["Porter five forces",      ["porter", "five", "forces"], []],
  ["What is a KPI in ATC?",   ["kpi", "atc"],          ["what", "is", "a", "in"]],
];
console.log("── term extraction ──");
for (const [q, must, mustNot] of termCases) {
  const t = extractTerms(q);
  const okHas = must.every((w) => t.has(w));
  const okNot = mustNot.every((w) => !t.has(w));
  check(`"${q}" → {${[...t].join(", ")}}`, okHas && okNot);
}

// ── Whole-word scoring: short acronym must not substring-match ──
console.log("\n── whole-word scoring ──");
const fakeChunk = ["Digital strategists deploy systems."];  // contains "it"? no. contains substring "it" in "Digital"? yes
const r = keywordSearch(fakeChunk, "IT", 1);
check(`"IT" does NOT match the substring inside "Digital" (score 0)`, r.top[0].score === 0);
const fakeChunk2 = ["The role of IT in business."];
const r2 = keywordSearch(fakeChunk2, "IT", 1);
check(`"IT" DOES match the whole word "IT" (score 1)`, r2.top[0].score === 1);

// ── Regression vs old behaviour on real data ──
console.log("\n── real-data retrieval (week-3 = BPR/BPI session) ──");
const w3 = load(3);
const oldFilter = (q) => new Set(q.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
function oldSearch(chunks, q) {
  const words = oldFilter(q);
  return chunks.map((c) => {
    let s = 0; const lc = c.toLowerCase();
    for (const w of words) if (lc.includes(w)) s++;
    return s;
  });
}
const q = "What is BPR?";
const oldScores = oldSearch(w3, q);
const newRes = keywordSearch(w3, q, 5);
const oldMax = Math.max(...oldScores);
const newMax = Math.max(...newRes.top.map((t) => t.score));
console.log(`  old terms: {${[...oldFilter(q)].join(", ")}}  → matches on noise word, max score ${oldMax}`);
console.log(`  new terms: {${[...newRes.terms].join(", ")}}  → matches on acronym, max score ${newMax}`);
// Old query reduces to the stopword "what" (signal-free); new query keeps "bpr".
check(`old query reduces to noise term {what} only`, [...oldFilter(q)].join() === "what");
check(`new query keeps the acronym {bpr}`, newRes.terms.has("bpr") && newRes.terms.size === 1);
const topHasBpr = new Set(newRes.top[0].text.toLowerCase().split(/\W+/)).has("bpr");
check(`top new chunk actually contains the whole word "bpr"`, topHasBpr && newMax >= 1);
console.log(`  top new chunk preview: "${newRes.top[0].text.slice(0, 90)}..."`);

if (fail) { console.error(`\n${fail} check(s) failed`); process.exit(1); }
console.log("\nAll B3 keywordSearch checks passed.");
