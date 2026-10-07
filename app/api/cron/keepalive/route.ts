import { NextRequest, NextResponse } from "next/server";
import { kvSet } from "@/lib/server/kv";

// Upstash's free-tier Redis is archived after sustained inactivity. This
// route exists purely to generate that traffic on a schedule — see the
// "crons" entry in vercel.json (once a day, the max allowed on Vercel's
// Hobby plan) — so the Free Trial credit ledger and student roster don't
// silently disappear between terms.
//
// Deliberately its own lightweight endpoint rather than reusing
// /api/admin/export as a keep-alive: that route returns the entire research
// log on every call (wasted work, noisier logs) and would force the cron
// secret and the admin-export secret to be the same value. This one writes
// a single small key and returns nothing sensitive.

// EU data residency: keep in sync with lib/server chat route's region.
export const preferredRegion = "fra1";

export async function GET(request: NextRequest) {
  // Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on
  // requests it generates for this project's own cron schedule — see
  // https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
  // Checking it here stops anyone else from using this path to probe
  // whether the KV store is up, or just to generate traffic/cost.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date().toISOString();
  try {
    await kvSet("cron:keepalive:lastRun", now);
  } catch (err) {
    console.error("Keep-alive KV write failed:", err);
    return NextResponse.json({ error: "KV store unavailable." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, lastRun: now });
}
