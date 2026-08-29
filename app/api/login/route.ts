import { NextRequest, NextResponse } from "next/server";
import { findStudentByCode } from "@/lib/server/roster";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/server/session";
import { ensureInitialized, getRemainingMicroUsd } from "@/lib/server/ledger";
import { logEvent } from "@/lib/server/analytics";

export async function POST(request: NextRequest) {
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  const student = findStudentByCode(code);
  if (!student) {
    return NextResponse.json({ error: "Access code not recognised." }, { status: 401 });
  }

  let remainingMicroUsd: number;
  try {
    await ensureInitialized(student.id);
    remainingMicroUsd = await getRemainingMicroUsd(student.id);
  } catch (err) {
    console.error("Free Trial login failed — credit store unavailable:", err);
    return NextResponse.json({ error: "Free Trial isn't set up yet. Try again later or use another mode." }, { status: 503 });
  }

  await logEvent({ type: "login", studentId: student.id, at: new Date().toISOString() });

  const res = NextResponse.json({
    studentId: student.id,
    name: student.name,
    remainingMicroUsd,
    mcpUrl: `${request.nextUrl.origin}/api/mcp/${encodeURIComponent(student.code)}`,
  });
  res.cookies.set(SESSION_COOKIE, createSessionToken(student.id), SESSION_COOKIE_OPTIONS);
  return res;
}
