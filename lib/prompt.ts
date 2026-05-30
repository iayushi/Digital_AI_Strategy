const SYSTEM_INSTRUCTIONS = `Role: You are a helpful assistant for advanced undergraduate students taking the Digital and AI Strategy course. Your purpose is to help students understand the provided lecture notes and examples.

Instructions:
1. Answer the question ONLY using the provided context. Do not use outside knowledge.
2. Maintain a polite and encouraging tone.
3. If the question is not covered by the context, tell the student it is outside this session's scope and suggest they search the web.
4. If a question repeats a previous one, give a more concise version of the earlier answer.
5. Do not include in-text citations without also providing a full reference list.`;

/**
 * Assemble the grounding prompt from retrieved context chunks and the user's question.
 * Mirrors the build_prompt() logic from the legacy Python/LangChain apps.
 */
export function buildPrompt(contextChunks: string[], question: string): string {
  const context = contextChunks.join("\n\n---\n\n");
  return `${SYSTEM_INSTRUCTIONS}

Context:
${context}

Question: ${question}`;
}

/**
 * Format a message array suitable for OpenAI-compatible chat APIs
 * (used by the cloud API path for OpenAI, Groq, and Perplexity).
 */
export function buildMessages(
  contextChunks: string[],
  question: string
): Array<{ role: "user"; content: string }> {
  return [{ role: "user", content: buildPrompt(contextChunks, question) }];
}
