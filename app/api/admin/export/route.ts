import { NextRequest, NextResponse } from "next/server";
import { readAllEvents } from "@/lib/server/analytics";

// Instructor-only export of the usage-metrics research log. Protected by a
// bearer secret (ADMIN_SECRET) — not the student session cookie — since this
// returns aggregate data across all students, not one student's own data.
//
// Deliberately Bearer-header-only, not a ?secret= query param: a URL with the
// secret baked in is too easy to accidentally leave open (browser history,
// shared links, logs) — fetch this with a script (see export_usage_data.py)
// instead of a pasted link.
export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin export is not configured (ADMIN_SECRET unset)." }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${adminSecret}`) {
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
