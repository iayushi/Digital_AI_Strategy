import { kvLogEvent } from "./kv";

// Usage-metrics-only event log for the UKAIS-funded engagement research —
// deliberately separate from lib/server/ledger.ts (the operational credit
// ledger). Every event carries only the roster's internal (pseudonymous)
// student id, never the raw access code or a real name, and never question
// or answer text — counts, timestamps, and mode/week identifiers only.

const EVENTS_KEY = "research:events";
const MAX_EVENTS = 20_000;

export type AnalyticsEvent =
  | { type: "login"; studentId: string; at: string }
  | { type: "chat"; studentId: string; week: number; inputTokens: number; outputTokens: number; latencyMs: number; complete: boolean; at: string }
  | { type: "mcp_search"; studentId: string; week: number | null; resultCount: number; at: string };

export async function logEvent(event: AnalyticsEvent): Promise<void> {
  await kvLogEvent(EVENTS_KEY, event, MAX_EVENTS).catch(() => {});
}

export async function readAllEvents(limit = MAX_EVENTS): Promise<AnalyticsEvent[]> {
  const { kvLRange } = await import("./kv");
  return kvLRange(EVENTS_KEY, 0, limit - 1);
}
