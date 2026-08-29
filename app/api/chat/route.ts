import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/server/session";
import { findStudentById } from "@/lib/server/roster";
import { acquireRateLimitLock, getRemainingMicroUsd, reserve, settle } from "@/lib/server/ledger";
import {
  MAX_OUTPUT_TOKENS,
  MICRO_USD_PER_INPUT_TOKEN,
  MICRO_USD_PER_OUTPUT_TOKEN,
  MODEL_ID,
  estimateInputTokens,
} from "@/lib/server/pricing";
import { buildPrompt } from "@/lib/prompt";
import { kvLogEvent } from "@/lib/server/kv";

const MAX_QUESTION_CHARS = 2000;
const MAX_CHUNKS_CHARS = 12000;

const client = new Anthropic();

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  // Origin check — defense in depth alongside the SameSite=Strict cookie.
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = request.headers.get("origin");
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return jsonError("Origin not allowed.", 403);
  }

  const studentId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!studentId) return jsonError("Not logged in.", 401);

  const student = findStudentById(studentId);
  if (!student) return jsonError("Student not recognised.", 401);

  let body: { week?: unknown; question?: unknown; chunks?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const chunks = Array.isArray(body.chunks) ? body.chunks.filter((c): c is string => typeof c === "string") : [];
  const week = typeof body.week === "number" ? body.week : 0;

  if (!question) return jsonError("Question is required.", 400);
  if (question.length > MAX_QUESTION_CHARS) return jsonError("Question is too long.", 400);
  const chunksChars = chunks.reduce((n, c) => n + c.length, 0);
  if (chunksChars > MAX_CHUNKS_CHARS) return jsonError("Retrieved context is too large.", 400);

  const prompt = buildPrompt(chunks, question);
  const inputTokenEstimate = estimateInputTokens(prompt);
  const reservationMicroUsd =
    inputTokenEstimate * MICRO_USD_PER_INPUT_TOKEN + MAX_OUTPUT_TOKENS * MICRO_USD_PER_OUTPUT_TOKEN;

  let reservation: Awaited<ReturnType<typeof reserve>>;
  try {
    const gotLock = await acquireRateLimitLock(studentId);
    if (!gotLock) return jsonError("Please wait a moment before sending another question.", 429);
    reservation = await reserve(studentId, reservationMicroUsd);
  } catch (err) {
    console.error("Free Trial credit check failed — credit store unavailable:", err);
    return jsonError("Free Trial isn't set up yet. Try again later or use another mode.", 503);
  }
  if (!reservation.ok) {
    const message =
      reservation.reason === "student_exhausted"
        ? "insufficient_credits"
        : "service_paused";
    return jsonError(message, 402);
  }

  let settled = false;
  let outputCharsSoFar = 0;
  const startedAt = Date.now();

  const finishOnce = async (usage: { input_tokens: number; output_tokens: number } | null) => {
    if (settled) return;
    settled = true;
    const actualMicroUsd = usage
      ? usage.input_tokens * MICRO_USD_PER_INPUT_TOKEN + usage.output_tokens * MICRO_USD_PER_OUTPUT_TOKEN
      : // No final usage (client disconnected mid-stream) — fall back to a
        // rough estimate from what was actually streamed out, rather than
        // either refunding the whole reservation or leaving it unsettled.
        inputTokenEstimate * MICRO_USD_PER_INPUT_TOKEN +
        Math.ceil(outputCharsSoFar / 4) * MICRO_USD_PER_OUTPUT_TOKEN;
    await settle(studentId, reservationMicroUsd, actualMicroUsd);
    await kvLogEvent("ft:metrics", {
      studentId,
      week,
      inputTokens: usage?.input_tokens ?? inputTokenEstimate,
      outputTokens: usage?.output_tokens ?? Math.ceil(outputCharsSoFar / 4),
      latencyMs: Date.now() - startedAt,
      complete: usage !== null,
      at: new Date().toISOString(),
    }).catch(() => {});
  };

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const messageStream = client.messages.stream(
          {
            model: MODEL_ID,
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [{ role: "user", content: prompt }],
          },
          { signal: abortController.signal }
        );

        messageStream.on("text", (delta) => {
          outputCharsSoFar += delta.length;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: delta })}\n\n`));
        });

        const final = await messageStream.finalMessage();
        await finishOnce({ input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens });
        const remainingMicroUsd = await getRemainingMicroUsd(studentId);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, remainingMicroUsd })}\n\n`));
        controller.close();
      } catch (err) {
        await finishOnce(null);
        const message = err instanceof Error ? err.message : "Generation failed.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
      void finishOnce(null);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
