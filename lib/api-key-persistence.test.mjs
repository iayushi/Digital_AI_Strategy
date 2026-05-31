/**
 * Node.js test for the opt-in API-key persistence rules (app/page.tsx).
 * Mirrors handleCloudApiKeyChange / handleRememberApiKeyChange / hydration so
 * the sessionStorage transitions are covered without a browser.
 * Usage: node lib/api-key-persistence.test.mjs
 */
const KEY = "dais.cloudApiKey";

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _dump: () => ({ ...store }),
  };
}

// Mirror of the persistence logic.
function onApiKeyChange(storage, remember, key) {
  if (!remember) return;
  if (key) storage.setItem(KEY, key);
  else storage.removeItem(KEY);
}
function onRememberChange(storage, remember, key) {
  if (remember && key) storage.setItem(KEY, key);
  else storage.removeItem(KEY);
}
function hydrate(storage) {
  const saved = storage.getItem(KEY);
  return { cloudApiKey: saved ?? "", rememberApiKey: !!saved };
}

let failures = 0;
function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

// Typing a key while NOT remembering must not persist it.
let s = makeStorage();
onApiKeyChange(s, false, "gsk_secret");
check("no persistence when remember is off", s.getItem(KEY) === null);

// Turning on remember with an existing key persists it.
s = makeStorage();
onRememberChange(s, true, "gsk_secret");
check("toggling remember on saves current key", s.getItem(KEY) === "gsk_secret");

// Typing while remembering keeps storage in sync.
onApiKeyChange(s, true, "gsk_updated");
check("editing key while remembering updates storage", s.getItem(KEY) === "gsk_updated");

// Clearing the key while remembering removes it.
onApiKeyChange(s, true, "");
check("clearing key while remembering removes storage", s.getItem(KEY) === null);

// Turning remember off always clears storage.
s = makeStorage({ [KEY]: "gsk_secret" });
onRememberChange(s, false, "gsk_secret");
check("toggling remember off clears storage", s.getItem(KEY) === null);

// Hydration restores both key and the remember flag.
s = makeStorage({ [KEY]: "gsk_saved" });
let h = hydrate(s);
check("hydrate restores saved key", h.cloudApiKey === "gsk_saved");
check("hydrate sets remember flag", h.rememberApiKey === true);

// Hydration with nothing saved yields empty + unchecked.
h = hydrate(makeStorage());
check("hydrate with no saved key is empty", h.cloudApiKey === "" && h.rememberApiKey === false);

// It must be sessionStorage semantics, never localStorage — documented by the
// key name and verified by the source not referencing localStorage.
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(__dirname, "../app/page.tsx"), "utf-8");
check("uses sessionStorage", /sessionStorage\.(get|set|remove)Item/.test(pageSrc));
check("does NOT call localStorage APIs", !/localStorage\.(get|set|remove)Item/.test(pageSrc));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll API-key persistence checks passed.");
