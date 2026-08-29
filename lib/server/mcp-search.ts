import { readFileSync, readdirSync } from "fs";
import path from "path";

// Server-side counterpart to lib/search.ts's keywordSearch — that version
// fetches "/data/week-N.bin" over HTTP (browser-only). This reads the same
// .bin files straight off disk, since a Next.js serverless function has the
// deployed `public/` directory available locally. Deliberately keyword-based,
// not embedding-based: no ML model download/cold-start risk in a serverless
// function, and the app's own fallback path already proves this is good
// enough for grounding real answers.

interface Chunk {
  text: string;
}

const DATA_DIR = path.join(process.cwd(), "public", "data");

function parseBin(buffer: Buffer): Chunk[] {
  let offset = 0;
  const numChunks = buffer.readUInt32LE(offset); offset += 4;
  const dim = buffer.readUInt32LE(offset); offset += 4;
  const chunks: Chunk[] = [];
  for (let i = 0; i < numChunks; i++) {
    const textLen = buffer.readUInt32LE(offset); offset += 4;
    const text = buffer.subarray(offset, offset + textLen).toString("utf-8"); offset += textLen;
    offset += dim * 4; // skip the embedding — not used by keyword search
    chunks.push({ text });
  }
  return chunks;
}

const chunkCache = new Map<number, Chunk[]>();

function loadWeekChunks(week: number): Chunk[] {
  if (chunkCache.has(week)) return chunkCache.get(week)!;
  const buffer = readFileSync(path.join(DATA_DIR, `week-${week}.bin`));
  const chunks = parseBin(buffer);
  chunkCache.set(week, chunks);
  return chunks;
}

export function availableWeeks(): number[] {
  return readdirSync(DATA_DIR)
    .map((f) => /^week-(\d+)\.bin$/.exec(f)?.[1])
    .filter((n): n is string => !!n)
    .map(Number)
    .sort((a, b) => a - b);
}

// Same stopword/acronym approach as lib/search.ts's keywordSearch.
const STOPWORDS = new Set([
  "a", "an", "and", "the", "or", "of", "to", "in", "on", "is", "it", "as", "at",
  "by", "be", "do", "if", "so", "we", "i", "for", "are", "was", "with", "that",
  "this", "from", "you", "your", "what", "how", "why", "who", "when", "where",
  "which", "does", "did", "can", "will", "would", "should", "could", "into",
  "its", "their", "they", "them", "then", "than", "but", "not", "all", "any",
  "our", "out", "use", "about", "over", "more", "most", "some", "such", "have",
  "has", "had", "were", "been", "being", "while", "also", "explain", "please",
]);

function extractTerms(query: string): Set<string> {
  const terms = new Set<string>();
  for (const tok of query.split(/\W+/)) {
    if (!tok) continue;
    const lower = tok.toLowerCase();
    const isAcronym = tok.length >= 2 && /^[A-Z0-9]+$/.test(tok);
    if (isAcronym) {
      terms.add(lower);
      continue;
    }
    if (lower.length > 2 && !STOPWORDS.has(lower)) terms.add(lower);
  }
  return terms;
}

export interface SearchResult {
  week: number;
  text: string;
  score: number;
}

function scoreChunks(week: number, terms: Set<string>): SearchResult[] {
  const chunks = loadWeekChunks(week);
  return chunks.map((c) => {
    const chunkWords = new Set(c.text.toLowerCase().split(/\W+/));
    let score = 0;
    for (const w of terms) if (chunkWords.has(w)) score++;
    return { week, text: c.text, score };
  });
}

// Bounded, per-query excerpts only — never a bulk document dump. Mirrors the
// same topK the chat UI itself uses for grounding, just server-side.
export function searchCourseContent(query: string, week?: number, topK = 4): SearchResult[] {
  const terms = extractTerms(query);
  if (terms.size === 0) {
    for (const tok of query.toLowerCase().split(/\W+/)) {
      if (tok.length > 1) terms.add(tok);
    }
  }

  const weeks = week ? [week] : availableWeeks();
  const scored = weeks.flatMap((w) => {
    try {
      return scoreChunks(w, terms);
    } catch {
      return []; // unknown/missing week — skip rather than fail the whole search
    }
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((c) => c.score > 0).slice(0, topK);
}
