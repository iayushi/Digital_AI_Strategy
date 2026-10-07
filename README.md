# Course RAG Chatbot — Starter Template

A RAG (Retrieval-Augmented Generation) chatbot for any university course, module, or training
program. Students ask questions; answers are grounded only in the lecture content you provide —
no outside knowledge, no hallucinated citations. Works for any subject: this started as a Digital &
AI Strategy course bot, but nothing in the code is specific to any topic. Swap in your own content
and it's yours.

**What's already built:** per-session chat, a server-funded "Free Trial" credit system (students get
a small starter budget so they don't need their own API key), an optional bring-your-own-key Cloud
API mode, an MCP connector so students can keep using the course content from their own free
Claude.ai account after credits run out, and an instructor-facing CLI for adding weekly content.

**What you need to add:** your own course name, session titles, sample questions, and lecture
content (currently one placeholder "Week 1" session with two example sentences — replace it).

## First steps

1. Get your own Anthropic API key, Vercel project, and Upstash Redis database (all free to start).
2. Set the required environment variables on your Vercel project — see `CLAUDE.md` in this repo for
   the full list (`ANTHROPIC_API_KEY`, `SESSION_SECRET`, `STUDENT_ROSTER`, the KV pair, etc.).
3. Replace `course.config.json` with your own course name and session list.
4. Add real content for each week: chunk a `.docx`, embed it, and write the binary file the app
   reads. The pipeline for this isn't in this repo (it's a few standalone Python scripts) — ask
   whoever shared this template with you, or rebuild it yourself: chunk with
   `unstructured.partition.docx`, embed with `sentence-transformers` using `all-MiniLM-L6-v2`
   (must match `lib/embedder.ts`), write little-endian
   `[num_chunks: u32][emb_dim: u32]` then per chunk `[text_len: u32][text: UTF-8][embedding: f32×dim]`
   to `public/data/week-N.bin`.
5. Deploy.

See `CLAUDE.md` for the full architecture (binary format, credit ledger, MCP connector, etc.) —
it's written for an AI coding assistant but is a complete technical reference either way.

---

*Built on [Next.js](https://nextjs.org). Originally bootstrapped with `create-next-app`.*
