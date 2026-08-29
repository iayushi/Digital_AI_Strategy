// Client for the server-funded "Free Trial" mode (version-2 only). All the
// actual API key handling, cost accounting, and credit enforcement happen in
// the /api/* route handlers — this file only talks to them.

export interface FreeTrialSession {
  studentId: string;
  name: string;
  remainingMicroUsd: number;
}

export function formatMicroUsd(microUsd: number): string {
  return `$${Math.max(0, microUsd / 1_000_000).toFixed(4)}`;
}

export async function loginFreeTrial(code: string): Promise<FreeTrialSession> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Login failed.");
  return body as FreeTrialSession;
}

export async function logoutFreeTrial(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}

export async function getFreeTrialSession(): Promise<FreeTrialSession | null> {
  const res = await fetch("/api/session");
  if (!res.ok) return null;
  const body = await res.json();
  return body.loggedIn ? (body as FreeTrialSession) : null;
}

/**
 * Streams a Free Trial answer. Calls onToken for each text delta, and
 * resolves with the final remaining balance once the stream ends.
 */
export async function streamFreeTrial(
  week: number,
  question: string,
  chunks: string[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<number> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ week, question, chunks }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (body.error === "insufficient_credits") {
      throw new Error(
        "🪙 You've used all your free starter credits. Switch to Cloud API mode with your own key, or use Browser AI (free)."
      );
    }
    if (body.error === "service_paused") {
      throw new Error("Free Trial is temporarily paused (shared budget exhausted). Try Cloud API or Browser AI.");
    }
    throw new Error(body.error ?? `Free Trial request failed (${res.status}).`);
  }
  if (!res.body) throw new Error("No response body from Free Trial.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let remainingMicroUsd = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = JSON.parse(trimmed.slice(5).trim());
      if (data.token) onToken(data.token);
      if (data.error) throw new Error(data.error);
      if (data.done) remainingMicroUsd = data.remainingMicroUsd;
    }
  }

  return remainingMicroUsd;
}
