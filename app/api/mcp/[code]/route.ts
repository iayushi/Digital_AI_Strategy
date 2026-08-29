import { NextRequest, NextResponse } from "next/server";
import { findStudentByCode } from "@/lib/server/roster";
import { searchCourseContent } from "@/lib/server/mcp-search";
import { logEvent } from "@/lib/server/analytics";

// A remote MCP server exposing read-only search over the course's lecture
// content, for students to connect to their own (free) Claude.ai account
// once their Free Trial credits run out — no API key, no server-funded
// LLM call, just a grounding tool their own Claude account uses during a
// normal chat. Gated by the student's roster access code in the URL path
// (no OAuth — Claude's custom-connector setup doesn't require it when the
// server doesn't demand it), so this isn't open to the public internet.
//
// Every response is a bounded, per-query excerpt (same topK shape as the
// chat UI's own grounding) — never a bulk document dump of the source docs.

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "dais-course-content", version: "1.0.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: string | number | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

const TOOLS = [
  {
    name: "search_course_content",
    description:
      "Search this Digital & AI Strategy course's lecture notes for content relevant to a question. Returns a few relevant excerpts, tagged by course week, to ground your answer — not a full document dump.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The question or topic to search the lecture notes for." },
        week: { type: "number", description: "Optional: restrict the search to one course week (e.g. 1-9). Omit to search all weeks." },
      },
      required: ["query"],
    },
  },
];

export async function GET() {
  // No server-initiated messages to stream — per the Streamable HTTP spec,
  // a server that doesn't offer a GET-initiated SSE stream returns 405.
  return new NextResponse(null, { status: 405 });
}

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const student = findStudentByCode(code);
  if (!student) {
    return NextResponse.json({ error: "Invalid or unrecognised connector URL." }, { status: 401 });
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(undefined, -32700, "Parse error");
  }

  switch (body.method) {
    case "initialize":
      return rpcResult(body.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      // Notification — no id, no response body expected.
      return new NextResponse(null, { status: 202 });

    case "tools/list":
      return rpcResult(body.id, { tools: TOOLS });

    case "tools/call": {
      const name = body.params?.name;
      const args = (body.params?.arguments ?? {}) as { query?: unknown; week?: unknown };
      if (name !== "search_course_content") {
        return rpcError(body.id, -32602, `Unknown tool: ${String(name)}`);
      }
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const week = typeof args.week === "number" ? args.week : undefined;
      if (!query) {
        return rpcError(body.id, -32602, "The 'query' argument is required.");
      }

      const results = searchCourseContent(query, week);
      await logEvent({
        type: "mcp_search",
        studentId: student.id,
        week: week ?? null,
        resultCount: results.length,
        at: new Date().toISOString(),
      });

      const text = results.length
        ? results.map((r) => `[Week ${r.week}]\n${r.text}`).join("\n\n---\n\n")
        : "No relevant course content found for that query.";

      return rpcResult(body.id, { content: [{ type: "text", text }] });
    }

    default:
      return rpcError(body.id, -32601, `Method not found: ${body.method}`);
  }
}
