import { NextRequest, NextResponse } from "next/server";
import { readAllEvents } from "@/lib/server/analytics";

// Instructor-only export of the usage-metrics research log. Protected by a
// bearer secret (ADMIN_SECRET) — not the student session cookie — since this
// returns aggregate data across all students, not one student's own data.
// Returns raw JSON; load it into a notebook/spreadsheet to compute session
// counts, session length (cluster login/chat/mcp_search timestamps per
// student within a gap threshold), per-week engagement, etc.
export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin export is not configured (ADMIN_SECRET unset)." }, { status: 503 });
  }

  // Accept the secret either as a Bearer header (curl/scripts) or a ?secret=
  // query param, so the export link also works pasted directly into a browser
  // — a plain URL can't carry a custom header.
  const auth = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const authorized = auth === `Bearer ${adminSecret}` || querySecret === adminSecret;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const events = await readAllEvents();
    return NextResponse.json({ count: events.length, events });
  } catch (err) {
    console.error("Admin export failed — credit store unavailable:", err);
    return NextResponse.json({ error: "Data store unavailable." }, { status: 503 });
  }
}
