import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/server/session";

// EU data residency: keep in sync with lib/server chat route's region.
export const preferredRegion = "fra1";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
