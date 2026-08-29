// Client-side simulation of a student LLM "starter credit" system for pilot
// testing (see UKAIS grant proposal: baseline free credits, then BYO API key
// or Browser AI). Two hardcoded test students, each starting with
// STARTING_CREDITS. Balances live in localStorage (unlike the sessionStorage
// used for cloud API keys) so they survive a refresh, not just a tab session.
//
// This is a UX prototype, not a real quota system: a student can reset their
// own balance via devtools, and there is no shared/funded backend behind it
// (the app is a static export with no server). It exists to validate the
// login -> credit -> exhaustion flow before building a real server-enforced
// version with a shared API key and a persistent store.

export interface TestStudent {
  id: string;
  name: string;
}

export const TEST_STUDENTS: TestStudent[] = [
  { id: "student-a", name: "Student A" },
  { id: "student-b", name: "Student B" },
];

export const STARTING_CREDITS = 2;

const LOGIN_KEY = "dais.credits.loggedInStudent";
const creditsKey = (studentId: string) => `dais.credits.balance.${studentId}`;

export function getLoggedInStudentId(): string | null {
  try {
    return localStorage.getItem(LOGIN_KEY);
  } catch {
    return null;
  }
}

export function loginAsStudent(studentId: string): void {
  try {
    localStorage.setItem(LOGIN_KEY, studentId);
  } catch {}
}

export function logoutStudent(): void {
  try {
    localStorage.removeItem(LOGIN_KEY);
  } catch {}
}

export function getCredits(studentId: string): number {
  try {
    const raw = localStorage.getItem(creditsKey(studentId));
    if (raw === null) return STARTING_CREDITS;
    const n = Number(raw);
    return Number.isFinite(n) ? n : STARTING_CREDITS;
  } catch {
    return STARTING_CREDITS;
  }
}

// Spends one credit (floored at 0) and returns the new balance.
export function spendCredit(studentId: string): number {
  const remaining = Math.max(0, getCredits(studentId) - 1);
  try {
    localStorage.setItem(creditsKey(studentId), String(remaining));
  } catch {}
  return remaining;
}

export function resetCredits(studentId: string): void {
  try {
    localStorage.setItem(creditsKey(studentId), String(STARTING_CREDITS));
  } catch {}
}
