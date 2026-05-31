/**
 * Node.js test for the Chrome AI availability → ChromeAIStatus mapping.
 * Mirrors the branch logic in lib/chromeai.ts::getChromeAIStatus so the
 * modern availability() API and the legacy capabilities() fallback are both
 * covered without a browser.
 * Usage: node lib/chromeai-status.test.mjs
 */

// ── Mirror of getChromeAIStatus mapping (lib/chromeai.ts) ──────────────────────
async function getChromeAIStatus(lm) {
  if (!lm) return "unavailable";
  try {
    if (typeof lm.availability === "function") {
      const status = await lm.availability();
      if (status === "available") return "ready";
      if (status === "downloadable" || status === "downloading") return "needs-download";
      return "unavailable";
    }
    if (typeof lm.capabilities === "function") {
      const caps = await lm.capabilities();
      if (caps?.available === "readily") return "ready";
      if (caps?.available === "after-download") return "needs-download";
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

let failures = 0;
async function check(label, actual, expected) {
  const a = await actual;
  const ok = a === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label} → ${a} (expected ${expected})`);
}

// No engine at all
await check("no LanguageModel", getChromeAIStatus(null), "unavailable");

// Modern API: availability()
await check("availability=available", getChromeAIStatus({ availability: async () => "available" }), "ready");
await check("availability=downloadable", getChromeAIStatus({ availability: async () => "downloadable" }), "needs-download");
await check("availability=downloading", getChromeAIStatus({ availability: async () => "downloading" }), "needs-download");
await check("availability=unavailable", getChromeAIStatus({ availability: async () => "unavailable" }), "unavailable");

// Legacy API: capabilities() (Chrome ≤128)
await check("capabilities=readily", getChromeAIStatus({ capabilities: async () => ({ available: "readily" }) }), "ready");
await check("capabilities=after-download", getChromeAIStatus({ capabilities: async () => ({ available: "after-download" }) }), "needs-download");
await check("capabilities=no", getChromeAIStatus({ capabilities: async () => ({ available: "no" }) }), "unavailable");

// availability() preferred over capabilities() when both exist
await check(
  "prefers availability over capabilities",
  getChromeAIStatus({ availability: async () => "available", capabilities: async () => ({ available: "no" }) }),
  "ready"
);

// Throwing API degrades gracefully
await check("availability throws", getChromeAIStatus({ availability: async () => { throw new Error("boom"); } }), "unavailable");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Chrome AI status checks passed.");
