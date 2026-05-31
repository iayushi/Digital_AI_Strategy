// Cloud API streaming for OpenAI-compatible providers.
// Anthropic is intentionally excluded — it does not support browser CORS.
// Gemini uses Google's OpenAI-compatible endpoint (free tier available).

export type CloudProvider = "OpenAI" | "Groq" | "Perplexity" | "Gemini";

export interface CloudProviderConfig {
  label: string;
  baseUrl: string;
  defaultModel: string;
  keyPrefix: string;
  keyHint: string;
}

export const CLOUD_PROVIDERS: Record<CloudProvider, CloudProviderConfig> = {
  OpenAI: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    keyPrefix: "sk-",
    keyHint: "Starts with sk-",
  },
  Groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.1-8b-instant",
    keyPrefix: "gsk_",
    keyHint: "Starts with gsk_",
  },
  Perplexity: {
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai/chat/completions",
    defaultModel: "sonar-pro",
    keyPrefix: "pplx-",
    keyHint: "Starts with pplx-",
  },
  Gemini: {
    label: "Gemini (Free tier)",
    // Google's OpenAI-compatible endpoint — uses the same SSE wire format
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.0-flash",
    keyPrefix: "AIza",
    keyHint: "Starts with AIza — get a free key at aistudio.google.com",
  },
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Validate that an API key matches the expected prefix for a provider.
 */
export function validateApiKey(provider: CloudProvider, key: string): boolean {
  return key.startsWith(CLOUD_PROVIDERS[provider].keyPrefix);
}

/**
 * Stream a chat response from a cloud provider.
 * All three providers share the OpenAI SSE wire format.
 * Calls onToken for each text delta; calls onToken("", true) when finished.
 */
export async function streamCloudChat(
  provider: CloudProvider,
  apiKey: string,
  modelName: string,
  messages: ChatMessage[],
  onToken: (token: string, done: boolean) => void,
  signal?: AbortSignal
): Promise<void> {
  const config = CLOUD_PROVIDERS[provider];

  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName || config.defaultModel,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} API error ${res.status}: ${body}`);
  }

  if (!res.body) throw new Error("No response body from API.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        onToken("", true);
        return;
      }

      try {
        const json = JSON.parse(data) as {
          choices: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const token = json.choices[0]?.delta?.content ?? "";
        if (token) onToken(token, false);
        if (json.choices[0]?.finish_reason != null) {
          onToken("", true);
          return;
        }
      } catch {
        // Malformed SSE line — skip
      }
    }
  }

  onToken("", true);
}
