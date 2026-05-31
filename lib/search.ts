export interface Chunk {
  text: string;
  embedding: Float32Array;
}

// Cache parsed chunks per week so the binary file is only fetched once per session
const chunkCache = new Map<number, Chunk[]>();

/**
 * Parse the binary week-N.bin file format:
 *   [num_chunks: uint32 LE][embedding_dim: uint32 LE]
 *   per chunk: [text_byte_len: uint32 LE][text: UTF-8][embedding: embDim × float32 LE]
 */
async function loadWeekChunks(week: number): Promise<Chunk[]> {
  if (chunkCache.has(week)) return chunkCache.get(week)!;

  const res = await fetch(`/data/week-${week}.bin`);
  if (!res.ok) throw new Error(`Could not load week-${week}.bin (${res.status})`);
  const buffer = await res.arrayBuffer();

  const view = new DataView(buffer);
  const decoder = new TextDecoder("utf-8");
  let offset = 0;

  const numChunks = view.getUint32(offset, true);
  offset += 4;
  const embDim = view.getUint32(offset, true);
  offset += 4;

  const chunks: Chunk[] = [];

  for (let i = 0; i < numChunks; i++) {
    const textLen = view.getUint32(offset, true);
    offset += 4;

    const text = decoder.decode(new Uint8Array(buffer, offset, textLen));
    offset += textLen;

    // slice() copies the bytes into a new buffer so alignment is guaranteed
    const embedding = new Float32Array(buffer.slice(offset, offset + embDim * 4));
    offset += embDim * 4;

    chunks.push({ text, embedding });
  }

  chunkCache.set(week, chunks);
  return chunks;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Find the top-k most relevant text chunks for a query embedding.
 * @param week       Session number (1, 2, 3, 4, 5, or 7)
 * @param queryEmbed Normalized 384-float vector from embedQuery()
 * @param topK       Number of chunks to return (default 5, matching the Python app)
 */
export async function searchWeek(
  week: number,
  queryEmbed: Float32Array,
  topK = 5
): Promise<string[]> {
  const chunks = await loadWeekChunks(week);

  const scored = chunks.map((c) => ({
    text: c.text,
    score: cosineSimilarity(queryEmbed, c.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((c) => c.text);
}

/** Pre-fetch and cache a week's binary file (call on session selection to hide latency). */
export function prefetchWeek(week: number): void {
  loadWeekChunks(week).catch(() => {});
}

/**
 * Common English words that carry no retrieval signal. Kept short and
 * lowercase. Acronyms that collide with these (e.g. "IT") are preserved
 * separately by detecting their original upper-case form — see extractTerms().
 */
const STOPWORDS = new Set([
  "a", "an", "and", "the", "or", "of", "to", "in", "on", "is", "it", "as", "at",
  "by", "be", "do", "if", "so", "we", "i", "for", "are", "was", "with", "that",
  "this", "from", "you", "your", "what", "how", "why", "who", "when", "where",
  "which", "does", "did", "can", "will", "would", "should", "could", "into",
  "its", "their", "they", "them", "then", "than", "but", "not", "all", "any",
  "our", "out", "use", "about", "over", "more", "most", "some", "such", "have",
  "has", "had", "were", "been", "being", "while", "also", "explain", "please",
]);

/**
 * Extract meaningful search terms from a query.
 * - All-caps tokens of length ≥ 2 are treated as acronyms (AI, IT, BPR, KPI,
 *   MD, ATC) and always kept, even when they collide with a stopword.
 * - Other tokens are kept when longer than 2 chars and not a stopword.
 */
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

/**
 * Keyword-overlap fallback search — used when the neural embedder can't load.
 * Scores chunks by how many unique query terms appear as whole words in the
 * text. Whole-word matching (rather than substring) prevents short acronyms
 * like "ai" or "it" from matching inside unrelated words (e.g. "digital").
 */
export async function keywordSearch(
  week: number,
  query: string,
  topK = 5
): Promise<string[]> {
  const chunks = await loadWeekChunks(week);
  const terms = extractTerms(query);

  // Fall back to all sufficiently-long tokens if the query was pure stopwords.
  if (terms.size === 0) {
    for (const tok of query.toLowerCase().split(/\W+/)) {
      if (tok.length > 1) terms.add(tok);
    }
  }

  const scored = chunks.map((c) => {
    const chunkWords = new Set(c.text.toLowerCase().split(/\W+/));
    let score = 0;
    for (const w of terms) if (chunkWords.has(w)) score++;
    return { text: c.text, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((c) => c.text);
}
