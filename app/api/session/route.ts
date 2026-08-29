import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/server/session";
import { findStudentById } from "@/lib/server/roster";
import { getRemainingMicroUsd } from "@/lib/server/ledger";

export async function GET(request: NextRequest) {
  const studentId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!studentId) {
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  const student = findStudentById(studentId);
  if (!student) {
    // Roster changed since this cookie was issued (e.g. code removed).
    return NextResponse.json({ loggedIn: false }, { status: 401 });
  }

  try {
    const remainingMicroUsd = await getRemainingMicroUsd(studentId);
    return NextResponse.json({ loggedIn: true, studentId, name: student.name, remainingMicroUsd });
  } catch (err) {
    console.error("Free Trial session check failed — credit store unavailable:", err);
    return NextResponse.json({ loggedIn: false }, { status: 503 });
  }
}
