// Minimal Upstash Redis REST client (no SDK dependency — just fetch against
// the REST API). This is the credit ledger's source of truth: every balance
// check, reservation, and settlement goes through here, atomically, so no
// client-reported number is ever trusted.
//
// Works with either the Vercel Marketplace "Upstash for Redis" integration
// (KV_REST_API_URL / KV_REST_API_TOKEN) or a directly-created Upstash
// database (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) — whichever
// pair is present.

function credentials(): { url: string; token: string } {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "No KV store configured. Set KV_REST_API_URL/KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN)."
    );
  }
  return { url, token };
}

async function command(...args: (string | number)[]): Promise<unknown> {
  const { url, token } = credentials();
  const path = args.map((a) => encodeURIComponent(String(a))).join("/");
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`KV command failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const body = (await res.json()) as { result: unknown };
  return body.result;
}

export async function kvGetInt(key: string): Promise<number | null> {
  const result = await command("get", key);
  if (result === null || result === undefined) return null;
  const n = Number(result);
  return Number.isFinite(n) ? n : null;
}

// Atomic increment (negative delta = decrement). Returns the new value.
export async function kvIncrBy(key: string, delta: number): Promise<number> {
  const result = await command("incrby", key, Math.trunc(delta));
  return Number(result);
}

// Sets key to value only if it doesn't already exist. Returns true if set.
export async function kvSetIfAbsent(key: string, value: number): Promise<boolean> {
  const result = await command("set", key, value, "NX");
  return result === "OK";
}

// Short-lived lock used for per-student rate limiting: succeeds (true) only
// if no lock is currently held, and auto-expires after ttlMs so a crashed
// request can't strand a student locked out forever.
export async function kvAcquireLock(key: string, ttlMs: number): Promise<boolean> {
  const result = await command("set", key, "1", "NX", "PX", ttlMs);
  return result === "OK";
}

// Append-only, capped event log for usage-metrics research tracking. Caller
// is responsible for keeping the payload pseudonymous (internal student id,
// never the raw access code or a real name).
export async function kvLogEvent(key: string, payload: unknown, maxEntries = 5000): Promise<void> {
  await command("lpush", key, JSON.stringify(payload));
  await command("ltrim", key, 0, maxEntries - 1);
}
