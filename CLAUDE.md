@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A RAG chatbot template for a university course, module, or training program — subject-agnostic.
Retrieval runs **in the browser**: pre-computed embeddings ship as binary `.bin` files in
`public/data/`, and the client embeds the query and does cosine search locally — no vector database
at runtime. The server side (`app/api/*`, `lib/server/*`) funds a small per-student Anthropic credit
balance so students don't need their own API key until it runs out.

Only `course.config.json` and the `public/data/week-N.bin` files carry actual course content —
everything else here is generic app logic. To stand this up for a new subject: replace those, set
your own environment variables (below), and deploy. There is currently one placeholder session
("Week 1") with two example sentences embedded — replace it with real content before sharing the
live URL with students.

---

## Commands

```powershell
npm install
npm run dev       # http://localhost:3000
npm run build
npm run lint      # eslint (flat config, eslint.config.mjs)
```

### Tests

Hand-written Node scripts with no test runner — each is executed directly and prints
`All ... checks passed.` (non-zero exit on failure). There is no `npm test`; run one file at a time:

```powershell
node lib/rag.test.mjs                  # .bin parser + cosine similarity (reads public/data/week-1.bin)
node lib/keyword-search.test.mjs       # stopword/acronym keyword fallback
node lib/prompt.test.mjs               # grounding-prompt rules
node lib/api-key-persistence.test.mjs  # sessionStorage key logic
node lib/server/ledger.test.mjs        # credit reserve/settle arithmetic
```

### Next.js 16 constraint

See `AGENTS.md` (imported above): this is Next.js 16 with breaking changes from older training
data — read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.

---

## Architecture

### Binary embedding format

`public/data/week-N.bin`, all little-endian:

```
[num_chunks: u32][emb_dim: u32]
per chunk: [text_byte_len: u32][text: UTF-8][embedding: emb_dim × f32]
```

Parsed in three independent places that must stay in sync: `lib/search.ts` (browser, `DataView`),
`lib/server/mcp-search.ts` (Node, `Buffer`, skips the embedding), and `lib/rag.test.mjs`. There is no
content-authoring pipeline in this repo — whoever shared this template may have one (chunk a `.docx`
with `unstructured.partition.docx`, embed with `sentence-transformers`'s `all-MiniLM-L6-v2`, write the
format above); otherwise you'll need to write your own, matching `lib/embedder.ts`'s model exactly or
every cosine score is meaningless.

### Retrieval path

`lib/embedder.ts` → `all-MiniLM-L6-v2` via `@xenova/transformers`, 384-dim normalized, singleton
pipeline, ONNX forced to `numThreads: 1` so no `SharedArrayBuffer`/COEP header is needed. The model
(~23 MB) and the week `.bin` are both pre-warmed on page load (`prefetchWeek` + `requestIdleCallback`).

`lib/search.ts` exports `searchWeek()` (cosine, top-5) and `keywordSearch()` (fallback). `handleSubmit`
in `app/page.tsx` tries neural first and silently falls back to keyword search if the embedder fails to
load — then surfaces a user-facing message only if both fail. The keyword path treats all-caps tokens
of length ≥ 2 as acronyms and keeps them even when they collide with a stopword, and matches whole
words so short acronyms don't match inside unrelated words.

### Turbopack `resolveAlias` fix (do not revert)

`@xenova/transformers` calls `Object.keys(fs/path/url)` at module-eval time. Its package `browser` field
maps those to `false`, which Turbopack resolves to `undefined` (webpack gave `{}`), so
`Object.keys(undefined)` throws and the embedder bundle never loads. `next.config.ts` aliases
`fs`/`path`/`url` to `lib/empty-module.js` (`module.exports = {}`) for the browser build.

### Course configuration

`course.config.json` is the single source for course name, subtitle, and every session title and
sample question. `lib/sessions.ts` imports it directly and exports `SESSIONS`, `COURSE_NAME`,
`COURSE_SUBTITLE`, `DEFAULT_WEEK`. Adding or retitling a session needs no TypeScript edit — but
`SESSIONS` must never be empty (`app/page.tsx` does `SESSIONS.find(...) ?? SESSIONS[0]` with no
further fallback, so a zero-length array crashes the page).

### Prompt

`lib/prompt.ts` `buildPrompt()` is the one grounding prompt, shared by the browser Cloud API path and
the server route. Several numbered instructions encode fixed bugs rather than style preferences —
rules 7/8 (anti-repetition, don't restart) and rule 9 (pop-culture analogies are a framing device, not
"outside knowledge" — without it, questions framed as movie/game analogies got wrongly refused as
"outside this session's scope").

---

## The Free Trial credit system

Students log in with an instructor-issued access code and spend a small, server-funded credit balance.
The Anthropic API key lives only on the server; the client never sees it and no client-reported number
is ever trusted.

**Request flow** (`app/api/chat/route.ts`): origin check → verify session cookie → look up roster entry →
acquire per-student rate-limit lock → **reserve** worst-case cost → stream from Anthropic → **settle** to
actual reported usage → log a pseudonymous analytics event. The browser still does retrieval and posts
the chunks up; the route owns the key, the prompt, and the accounting.

Layers in `lib/server/`:

- **`pricing.ts`** — everything is integer **micro-USD** (`$1/M tokens` ≡ `1 micro-USD/token`), so
  reservation, settlement, and refund are exact integer arithmetic with no float drift on a sub-dollar
  budget. `MAX_OUTPUT_TOKENS = 700` caps a single response independent of balance. `lib/freetrial.ts`
  divides by 1000 to show whole "points" — presentation only, the ledger stays in micro-USD.
- **`ledger.ts`** — two-tier budget. A per-student key *and* an independent global backstop
  (`GLOBAL_BUDGET_MICRO_USD`) so a per-student accounting bug can't run up unbounded spend on the
  shared key. `reserve()` leans on Redis `INCRBY` atomicity: concurrent requests can't both win,
  because the loser's decrement goes negative, is detected, and is refunded immediately. Pair every
  successful `reserve()` with exactly one `settle()` — including on client disconnect, where
  `finishOnce(null)` estimates from streamed characters rather than refunding everything or leaving the
  reservation stranded.
- **`kv.ts`** — hand-rolled Upstash Redis REST client over `fetch` (no SDK). Accepts either the Vercel
  Marketplace pair (`KV_REST_API_*`) or a direct Upstash pair (`UPSTASH_REDIS_REST_*`). This is the
  ledger's source of truth.
- **`session.ts`** — stateless HMAC-SHA256 signed token (`base64url(payload).signature`) in an
  HttpOnly/Secure/SameSite=Strict cookie, 30-day max age, compared with `timingSafeEqual`.
- **`roster.ts`** — the student list, parsed from the `STUDENT_ROSTER` env var (`[{code,id,name}]`) and
  cached per process, so you change who exists without redeploying code. **Use non-identifying `id`
  values** (`s001`) — `id` is what lands in the analytics log.
- **`analytics.ts`** — capped append-only research event log, deliberately separate from the operational
  ledger. Records counts, timings, week, and the pseudonymous id only — never question/answer text,
  never the access code or a real name.

All API routes set `preferredRegion = "fra1"`; change this to whichever region your KV store lives in
(keep them in sync) or remove it if region doesn't matter to you.

### MCP connector (`app/api/mcp/[code]/route.ts`)

A minimal JSON-RPC Streamable-HTTP MCP server exposing one read-only tool, `search_course_content`, so a
student whose credits run out can attach the course notes to their own free Claude.ai account. Auth is
the roster access code in the URL path (no OAuth). It uses the keyword searcher, not embeddings — no ML
cold-start in a serverless function — and returns bounded per-query excerpts, never a bulk dump. The
login and session routes hand each student their personal `mcpUrl`.

### Required environment variables (on Vercel)

`ANTHROPIC_API_KEY` is read implicitly by `new Anthropic()` and so appears nowhere in the source —
it is still required.

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | required (implicit, Anthropic SDK default) |
| `SESSION_SECRET` | required — HMAC key for session cookies |
| `STUDENT_ROSTER` | required — `[{"code":"ABCD-1234","id":"s001","name":"Student A"}]` |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | required — or the `UPSTASH_REDIS_REST_*` pair |
| `ADMIN_SECRET` | optional — gates `/api/admin/export`; unset ⇒ 503 |
| `ALLOWED_ORIGIN` | optional — origin allowlist for `/api/chat` |
| `STUDENT_BUDGET_MICRO_USD` | optional — per-student start, default `500000` ($0.50 = 500 pts) |
| `GLOBAL_BUDGET_MICRO_USD` | optional — global backstop, default `20000000` ($20) |
| `CRON_SECRET` | required for the keep-alive cron (below) to authenticate; any random 16+ char string |

Vercel env changes only take effect on the **next deploy** — always redeploy after changing one.

`/api/admin/export` is **Bearer-header only, by design** — a `?secret=` query param would be too easy
to leave exposed in a URL (history, logs, shared links). Fetch it with a small script that sends the
secret as an `Authorization: Bearer <secret>` header, not a pasted link.

### Diagnosing a broken Free Trial

The two server dependencies fail with distinguishable symptoms:

| Symptom | Cause |
|---|---|
| Access-code login itself fails: *"Free Trial isn't set up yet. Try again later or use another mode."* (503) | **KV store** unreachable or unconfigured. Every route wraps its KV call and maps any throw to this message. |
| Login succeeds and shows a points balance, but asking a question returns `⚠️` plus an auth error | **`ANTHROPIC_API_KEY`** invalid/expired. `/api/chat` forwards the SDK's own error text into the SSE stream. |
| `insufficient_credits` / `service_paused` (402) | Working as designed — per-student balance or the global backstop is exhausted. |

The KV store holds two things not recoverable from code: every student's remaining balance
(`ft:budget:*`) and the whole research event log (`research:events`). Export the research log before
migrating or recreating the database — balances can't be exported; a fresh KV silently re-initializes
every student to the starting budget on their next login (`ensureInitialized` → `kvSetIfAbsent`).

**Keep-alive cron (`app/api/cron/keepalive/route.ts`):** a `vercel.json` cron entry hits this route
once a day (the max Vercel's Hobby/free plan allows) and writes one small KV key, so a free-tier
Upstash database doesn't get archived for inactivity between terms. Authenticated by `CRON_SECRET`,
which Vercel automatically sends as `Authorization: Bearer <CRON_SECRET>` on its own cron-triggered
requests — deliberately a different secret from `ADMIN_SECRET`. Uses `kvSet()` (unconditional
overwrite), not `kvIncrBy()`, because Vercel cron delivery can occasionally double-fire and a repeated
overwrite is harmless where a repeated increment would not be.

---

## Deployment footguns

1. **The local Vercel link is branch-blind, mutable state** (`.vercel/repo.json` or `project.json`,
   gitignored) — if you ever manage more than one Vercel project from this checkout, double check
   which one it's linked to (`cat .vercel/repo.json`) before `vercel --prod`.
2. If you add your own content-update script, have it **push whatever branch is currently checked out**
   (`git rev-parse --abbrev-ref HEAD`), not a hardcoded branch name — don't assume `main`.

`vercel.json` sets `"framework": "nextjs"` explicitly (needed since this has real server routes) plus
security headers (COOP, CSP `frame-ancestors 'none'`, X-Frame-Options, nosniff, Referrer-Policy,
Permissions-Policy).
