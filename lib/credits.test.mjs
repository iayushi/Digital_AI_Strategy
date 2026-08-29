/**
 * Node.js test for the pilot-test starter-credit system (lib/credits.ts).
 * Mirrors the localStorage-backed get/spend/reset logic without a browser.
 * Usage: node lib/credits.test.mjs
 */
const STARTING_CREDITS = 2;
const LOGIN_KEY = "dais.credits.loggedInStudent";
const creditsKey = (id) => `dais.credits.balance.${id}`;

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// Mirror of the lib/credits.ts logic.
function getCredits(storage, id) {
  const raw = storage.getItem(creditsKey(id));
  if (raw === null) return STARTING_CREDITS;
  const n = Number(raw);
  return Number.isFinite(n) ? n : STARTING_CREDITS;
}
function spendCredit(storage, id) {
  const remaining = Math.max(0, getCredits(storage, id) - 1);
  storage.setItem(creditsKey(id), String(remaining));
  return remaining;
}
function resetCredits(storage, id) {
  storage.setItem(creditsKey(id), String(STARTING_CREDITS));
}

let failures = 0;
function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

// A student with no recorded balance starts with the full allocation.
let s = makeStorage();
check("new student starts with 2 credits", getCredits(s, "student-a") === 2);

// Spending decrements by one and persists.
check("spend returns 1 after first spend", spendCredit(s, "student-a") === 1);
check("balance persists at 1", getCredits(s, "student-a") === 1);

// Spending floors at zero — never goes negative.
spendCredit(s, "student-a");
check("balance reaches 0 after second spend", getCredits(s, "student-a") === 0);
spendCredit(s, "student-a");
check("balance floors at 0, does not go negative", getCredits(s, "student-a") === 0);

// Two students track independent balances.
s = makeStorage();
spendCredit(s, "student-a");
check("student-a balance is 1", getCredits(s, "student-a") === 1);
check("student-b balance is untouched at 2", getCredits(s, "student-b") === 2);

// Reset restores the full starting allocation.
resetCredits(s, "student-a");
check("reset restores 2 credits", getCredits(s, "student-a") === 2);

// It must be localStorage (survives tab close), never sessionStorage —
// verified against the actual source.
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const creditsSrc = readFileSync(join(__dirname, "credits.ts"), "utf-8");
check("uses localStorage", /localStorage\.(get|set|remove)Item/.test(creditsSrc));
check("does NOT call sessionStorage APIs", !/sessionStorage\.(get|set|remove)Item/.test(creditsSrc));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll starter-credit checks passed.");
