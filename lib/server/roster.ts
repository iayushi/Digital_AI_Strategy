// The instructor-controlled student roster for the pilot: one unique access
// code per student, mapped to an internal id and display name. Configured via
// the STUDENT_ROSTER env var so the instructor controls exactly who exists
// and how many credits they get, without redeploying code.
//
// Format: '[{"code":"ALPHA-7F3K","id":"s001","name":"Student A"}, ...]'
//
// Privacy note: use non-identifying `id` values (e.g. "s001"), not real
// names or emails — `id` is what ends up in usage-metrics logging.

export interface RosterEntry {
  code: string;
  id: string;
  name: string;
}

let cached: RosterEntry[] | null = null;

function loadRoster(): RosterEntry[] {
  if (cached) return cached;
  const raw = process.env.STUDENT_ROSTER;
  if (!raw) {
    cached = [];
    return cached;
  }
  try {
    const parsed = JSON.parse(raw) as RosterEntry[];
    cached = Array.isArray(parsed) ? parsed : [];
  } catch {
    cached = [];
  }
  return cached;
}

export function findStudentByCode(code: string): RosterEntry | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  return loadRoster().find((s) => s.code === trimmed) ?? null;
}

export function findStudentById(id: string): RosterEntry | null {
  return loadRoster().find((s) => s.id === id) ?? null;
}
