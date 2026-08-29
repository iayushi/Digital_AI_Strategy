/**
 * Node.js test for the Free Trial credit ledger's arithmetic (lib/server/ledger.ts).
 * Mirrors the atomic reserve/settle logic against an in-memory Redis-like
 * store (INCRBY/SETNX semantics) so the money-handling invariants are
 * verified without a real KV connection.
 * Usage: node lib/server/ledger.test.mjs
 */
const GLOBAL_KEY = "ft:budget:global";
const studentKey = (id) => `ft:budget:${id}`;

function makeStore(initial = {}) {
  const data = { ...initial };
  return {
    incrby: (key, delta) => {
      data[key] = (data[key] ?? 0) + delta;
      return data[key];
    },
    setnx: (key, value) => {
      if (key in data) return false;
      data[key] = value;
      return true;
    },
    get: (key) => data[key] ?? null,
  };
}

// Mirror of lib/server/ledger.ts reserve()/settle() logic.
function reserve(store, studentId, amount) {
  store.setnx(studentKey(studentId), 500_000);
  store.setnx(GLOBAL_KEY, 20_000_000);

  const newGlobal = store.incrby(GLOBAL_KEY, -amount);
  if (newGlobal < 0) {
    store.incrby(GLOBAL_KEY, amount);
    return { ok: false, reason: "global_exhausted" };
  }
  const newStudent = store.incrby(studentKey(studentId), -amount);
  if (newStudent < 0) {
    store.incrby(studentKey(studentId), amount);
    store.incrby(GLOBAL_KEY, amount);
    return { ok: false, reason: "student_exhausted" };
  }
  return { ok: true };
}

function settle(store, studentId, reserved, actual) {
  const refund = reserved - actual;
  if (refund === 0) return;
  store.incrby(studentKey(studentId), refund);
  store.incrby(GLOBAL_KEY, refund);
}

let failures = 0;
function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

// New student starts at the $0.50 default and reserving decrements it.
let s = makeStore();
let r = reserve(s, "s001", 8_000);
check("reserve succeeds against a fresh budget", r.ok === true);
check("student balance decremented by the reservation", s.get(studentKey("s001")) === 492_000);
check("global balance decremented by the same amount", s.get(GLOBAL_KEY) === 19_992_000);

// Settling refunds the unused portion of the reservation (actual < reserved).
settle(s, "s001", 8_000, 3_000);
check("settle refunds the difference to the student", s.get(studentKey("s001")) === 497_000);
check("settle refunds the difference to the global backstop", s.get(GLOBAL_KEY) === 19_997_000);

// A reservation larger than the remaining balance is rejected AND fully refunded —
// this is the core "can't exceed your own allocation" guarantee.
s = makeStore({ [studentKey("s001")]: 5_000, [GLOBAL_KEY]: 20_000_000 });
r = reserve(s, "s001", 8_000);
check("over-budget reservation is rejected", r.ok === false && r.reason === "student_exhausted");
check("student balance is restored exactly (no partial spend)", s.get(studentKey("s001")) === 5_000);
check("global balance is restored exactly too", s.get(GLOBAL_KEY) === 20_000_000);

// Two students have fully independent balances — one can never dip into another's.
s = makeStore();
reserve(s, "s001", 100_000);
check("student A's balance dropped", s.get(studentKey("s001")) === 400_000);
check("student B's balance is untouched", s.get(studentKey("s002")) === null); // not yet initialized
r = reserve(s, "s002", 100_000);
check("student B gets their own fresh $0.50 allocation", s.get(studentKey("s002")) === 400_000);
check("student A's balance did not change from B's activity", s.get(studentKey("s001")) === 400_000);

// The global backstop blocks spend even when a student still has budget —
// this is the "org-wide safety net independent of per-student accounting" gate.
s = makeStore({ [studentKey("s001")]: 500_000, [GLOBAL_KEY]: 1_000 });
r = reserve(s, "s001", 8_000);
check("global backstop rejects when the org-wide budget is exhausted", r.ok === false && r.reason === "global_exhausted");
check("student balance is untouched when blocked by the global backstop", s.get(studentKey("s001")) === 500_000);

// Simulated race: two "concurrent" reservations against a balance that can
// only satisfy one. Redis INCRBY is atomic per call, so applying them in
// sequence (as if interleaved) must still never let combined spend exceed
// the starting balance.
s = makeStore({ [studentKey("s001")]: 10_000, [GLOBAL_KEY]: 20_000_000 });
const first = reserve(s, "s001", 8_000);
const second = reserve(s, "s001", 8_000);
check("first concurrent reservation succeeds", first.ok === true);
check("second concurrent reservation is rejected, not double-spent", second.ok === false);
check("balance after the race reflects exactly one reservation", s.get(studentKey("s001")) === 2_000);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Free Trial ledger checks passed.");
