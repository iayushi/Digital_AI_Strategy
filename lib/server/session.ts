import { createHmac, timingSafeEqual } from "crypto";

// Signed, stateless session token: base64url(payload) + "." + HMAC-SHA256(payload).
// Carried in an HttpOnly/Secure/SameSite=Strict cookie (set in the login route)
// so the browser can't read or forge it, and a student can never claim to be
// someone else — the server is the only thing that can produce a valid token.

export const SESSION_COOKIE = "dais.freetrial.session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface SessionPayload {
  studentId: string;
  issuedAt: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not configured.");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(studentId: string): string {
  const payload: SessionPayload = { studentId, issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as SessionPayload;
    const ageMs = Date.now() - payload.issuedAt;
    if (ageMs < 0 || ageMs > SESSION_MAX_AGE_SECONDS * 1000) return null;
    return payload.studentId;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
