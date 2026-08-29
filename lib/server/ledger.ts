import { kvAcquireLock, kvGetInt, kvIncrBy, kvSetIfAbsent } from "./kv";
import { startingBudgetMicroUsd } from "./pricing";

// Per-student key holds that student's remaining micro-USD. A separate
// global key is an independent backstop across all students combined — a
// second gate so a bug in per-student accounting can't silently run up
// unbounded spend on the shared API key.
const studentKey = (id: string) => `ft:budget:${id}`;
const GLOBAL_KEY = "ft:budget:global";
const lockKey = (id: string) => `ft:lock:${id}`;

const DEFAULT_GLOBAL_CAP_MICRO_USD = 20_000_000; // $20 default org-wide backstop

function globalCapMicroUsd(): number {
  const raw = process.env.GLOBAL_BUDGET_MICRO_USD;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_GLOBAL_CAP_MICRO_USD;
}

export async function ensureInitialized(studentId: string): Promise<void> {
  await kvSetIfAbsent(studentKey(studentId), startingBudgetMicroUsd());
  await kvSetIfAbsent(GLOBAL_KEY, globalCapMicroUsd());
}

export async function getRemainingMicroUsd(studentId: string): Promise<number> {
  await ensureInitialized(studentId);
  return (await kvGetInt(studentKey(studentId))) ?? 0;
}

export type ReserveResult =
  | { ok: true }
  | { ok: false; reason: "student_exhausted" | "global_exhausted" };

// Atomically reserves `amountMicroUsd` from both the student's balance and
// the global backstop. Each INCRBY is atomic in Redis, so two concurrent
// requests can never both succeed past a balance neither could individually
// afford — the loser's decrement goes negative, is detected, and is refunded
// immediately. Always pair a successful reserve with settle() below.
export async function reserve(studentId: string, amountMicroUsd: number): Promise<ReserveResult> {
  await ensureInitialized(studentId);

  const newGlobal = await kvIncrBy(GLOBAL_KEY, -amountMicroUsd);
  if (newGlobal < 0) {
    await kvIncrBy(GLOBAL_KEY, amountMicroUsd);
    return { ok: false, reason: "global_exhausted" };
  }

  const newStudent = await kvIncrBy(studentKey(studentId), -amountMicroUsd);
  if (newStudent < 0) {
    await kvIncrBy(studentKey(studentId), amountMicroUsd);
    await kvIncrBy(GLOBAL_KEY, amountMicroUsd);
    return { ok: false, reason: "student_exhausted" };
  }

  return { ok: true };
}

// Reconciles a reservation down to the model's actual reported cost, refunding
// the difference. Call this exactly once per successful reserve() — including
// on client disconnect / stream abort, using whatever token usage was
// actually accumulated before the abort (0 usage just refunds the whole
// reservation).
export async function settle(
  studentId: string,
  reservedMicroUsd: number,
  actualMicroUsd: number
): Promise<void> {
  const refund = reservedMicroUsd - actualMicroUsd;
  if (refund === 0) return;
  await kvIncrBy(studentKey(studentId), refund);
  await kvIncrBy(GLOBAL_KEY, refund);
}

// One in-flight request per student at a time, with a cooldown after it ends
// (the lock's TTL) — blunts scripted rapid-fire submission.
export async function acquireRateLimitLock(studentId: string, ttlMs = 3000): Promise<boolean> {
  return kvAcquireLock(lockKey(studentId), ttlMs);
}
