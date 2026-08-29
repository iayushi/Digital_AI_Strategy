// Claude Haiku 4.5 pricing, expressed as micro-USD per token ($ per million
// tokens IS micro-USD per token — e.g. $1/M input = 1 micro-USD/input token).
// Using this integer unit for the whole credit ledger means every calculation
// (reservation, settlement, refund) is exact integer arithmetic — no floats,
// no rounding drift on a budget this small.
export const MODEL_ID = "claude-haiku-4-5";
export const MICRO_USD_PER_INPUT_TOKEN = 1; // $1.00 / 1M tokens
export const MICRO_USD_PER_OUTPUT_TOKEN = 5; // $5.00 / 1M tokens

// Hard ceiling on a single response, independent of remaining budget — caps
// the worst case a single request can cost regardless of what's asked.
export const MAX_OUTPUT_TOKENS = 700;

// Starting per-student allocation. $0.50 approximates the requested €0.50
// (USD/EUR has been close to parity); tune down a few cents for a strict
// safety margin once real FX matters, via STUDENT_BUDGET_MICRO_USD env var.
export const DEFAULT_STARTING_BUDGET_MICRO_USD = 500_000;

export function startingBudgetMicroUsd(): number {
  const raw = process.env.STUDENT_BUDGET_MICRO_USD;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_STARTING_BUDGET_MICRO_USD;
}

// Conservative (over-)estimate of input tokens from raw character count, used
// only to size the upfront reservation before the real call — settlement
// below always corrects to the model's actual reported usage.
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}
