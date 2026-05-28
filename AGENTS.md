# AGENTS.md

## Commands

```bash
npm run dev       # dev server on http://localhost:8080 (NOT default 5173)
npm run build     # Vite build → build/ (adapter-node, run with `node build`)
npm run fmt       # Prettier 2 via npx -p (NOT local install)
```

No test suite. All verification is manual.

## Architecture gotchas

**SPA mode** (`ssr: false` in `src/routes/+layout.js:3`). Auth is client-side only: JWT stored in `localStorage.user`, route guard checks it in `+layout.js` load function. No server-side session.

**notifyUpdate pattern** — The single most important design quirk. Chat logic runs in `src/lib/chat/ollama.ts` / `openai.ts`, outside Svelte component scope. Mutations to `history` objects are invisible to Svelte's compiler. Components use `let updateCounter = 0` + `$: updateCounter, (() => { rebuild })();` and pass `c().notifyUpdate()` into the chat modules. Whenever you mutate history/stream responses, you MUST call `c().notifyUpdate()`. Also: use `c().messages` (not a destructured snapshot) for logic that needs latest data; use `currentCtx.autoScroll` (not the captured value) inside streaming loops.

**Reactive block guard**: `history.messages[history.currentId]` checked before traversal to prevent crashes when `currentId` points to a deleted message.

## Database

MySQL 8 on `localhost:3307` (override via `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE` env vars), database `webui_chat`. Connection pool at `src/lib/server/db.ts`.

Tables are auto-created AND auto-migrated with `ALTER TABLE ... .catch(() => {})` — this means migration DDL silently fails on existing columns. When adding a column, add it as a new `pool.execute(ALTER TABLE ...).catch(() => {})` block. Never remove or modify existing migration blocks.

**timestamp column**: migrated from `BIGINT` (ms) to `DATETIME` (`YYYY-MM-DD HH:MM:SS`). New code MUST use `datetimeNow()` from `src/lib/utils/index.ts`, not epoch milliseconds.

**Legacy passwords**: may be plaintext if not yet migrated via `scripts/migrate-passwords.ts`.

## Library quirks

- `svelte-french-toast` v1.x has NO `toast.info()` — use the generic `toast()` function instead.
- `prettier@2` is pinned, format is tabs + no trailing commas (`.prettierrc`).
- `bcryptjs` (pure JS), NOT `bcrypt` (native). JWT is custom HMAC-SHA256 via Node.js `crypto.createHmac`, not jsonwebtoken.
- `dompurify` for HTML sanitization (replaced regex-based XSS protection).

## Chat engine architecture

**Message routing**: Ollama models → `sendPromptOllama` (streaming SSE via `/api/chat`), third-party OpenAI-compatible → `sendPromptOpenAI` (streaming via `/chat/completions`). Models processed **sequentially** (not `Promise.all`) to avoid history corruption.

**Context compression**: Before sending to any model, total character count is estimated (chars/2 ≈ tokens). If exceeding `num_ctx * 0.85` (default 200K), oldest messages are truncated. A system note `[对话上下文已压缩：早期 N 条消息已省略]` is inserted. Local history is NOT modified.

**Web search injection**: if `settings.webSearch` is true, `submitPrompt()` calls `/api/web-search` before model dispatch and appends a `[联网搜索结果...]` block to the request-only `finalPrompt`. This context is NOT written into local history.

**File parsing injection**: uploads are read as data URLs in `MessageInput.svelte` / `Messages.svelte`. Non-image documents call authenticated `/api/parse-file`, which extracts text from `txt/md/csv/doc/docx/pdf/xls/xlsx/pptx` (`.doc` best-effort via `word-extractor`) and stores it on the in-memory upload object. `submitPrompt()` appends parsed file text to request-only `finalPrompt`; local message history stores only attachment metadata and preview labels, not the extracted text.

**Third-party models**: receive request-only user input + configured system prompt; if web search is enabled, the request-only input may include the search result block. Image uploads are sent as OpenAI vision content only for likely vision-capable models; otherwise they degrade to a text note.

**Ollama models**: receive request-only user input + system prompt (persona + emotion sensing); if web search is enabled, the request-only input may include the search result block.

**Abort mechanism**: `abortRefs` array (index-based, per-model) + `stopRef` boolean. `stopResponse()` sets `stopRef = true` and aborts all controllers in `abortRefs`.

**Message tree utilities**: `removeMessageBranch()` in `src/lib/utils/index.ts` handles recursive deletion with dangling `currentId` protection.

## Third-party API models

Providers stored in `localStorage.apiProviders` (also synced to MySQL `api_providers` table for cross-browser support). Models named as `提供商名/模型ID` (provider-name/model-id). `sendPrompt` auto-routes: Ollama models → `sendPromptOllama`, third-party → `sendPromptOpenAI` via `findProvider()` matching by model name prefix.

**Provider sync**: `(app)/+layout.svelte` runs `syncProviders()` on load — fetches providers from `/api/providers` and writes to localStorage. SettingsModal saves to both localStorage and API simultaneously. `/api/providers` POST uses a transaction around delete+insert to avoid losing providers on partial failure.

**Default model**: New sessions default to first third-party model if any exist, then fall back to first Ollama model (`ModelSelector.svelte`). User can manually set a default via the settings panel "设为默认" button, which persists to `localStorage.settings.models` and takes priority over auto-selection. The compact model selector in the chat input no longer auto-saves on change.

## Auth / Security

- JWT secret overridable via `JWT_SECRET` env var. All API routes use `requireAuth()`.
- Client-side `authFetch` auto-attaches Bearer token and redirects to `/login` on 401.
- Registration rate-limited: 5 per minute per IP (in-memory Map).
- Password minimum 6 characters, enforced by both UI and server routes (`/api/auth`, `/api/user/profile`).
- Open Redirect protection: rejects `//evil.com` protocol-relative URLs.
- XSS: DOMPurify sanitizes all AI output before `{@html}` rendering.
- SSRF: `fetch-url` uses `redirect: manual`, `web-search` checks custom URLs via shared `isPrivateUrl()`.
- TOCTOU: `chats/[id]` PUT statement includes `AND username = ?`.
- Username changes sync ownership across `chats`, `api_providers`, `mood_history`, `advice_table`, and `feedback_table`, then issue a fresh token.

## References

- Full architecture docs: `CLAUDE.md`
- Implementation plan: `.claude/plans/`

## Recent changes (2026-05-29)

**Layout**: User messages now left-aligned (avatar on left, `items-start`/`justify-start`). Avatars enlarged to `w-10 h-10` (40px). Bubble has `w-fit` (content-width, no stretching) and NO `break-words` (was causing premature line wraps in Chinese text).

**Timestamp alignment**: Instead of manual `ml-13` (52px = 40px avatar + 12px gap), timestamp rows use a flex spacer pattern — `<div class="flex justify-start items-center gap-3"><div class="w-10"></div><div class="flex items-center gap-1">...</div></div>` — identical flex structure to the avatar+bubble row, guaranteeing alignment without fragile margin calculations.

**Markdown output**: Both `ollama.ts` and `openai.ts` system prompts now always include a hardcoded Markdown formatting instruction (independent of user-defined system prompt or emotion sensing toggle). The rendering pipeline (`marked` → `DOMPurify` → `{@html}`) handles both Ollama and third-party API outputs identically.

**P0/P1 fixes**: `svelte.config.js` now uses `@sveltejs/adapter-node` to match `node build`. Web search is wired into chat requests. Provider saves are transactional. Settings save awaits store/localStorage update before remote sync. Server-side password length validation is enforced. Username changes sync all username-owned tables. OpenAI-compatible image messages use typed vision content when appropriate and degrade to text for non-vision models.

**Knowledge base (RAG)**: `src/lib/server/knowledge-base.ts` provides `chunkText`, `cosineSimilarity`, `getOllamaEmbedding`, `queryKnowledgeBase`, `processDocument`, and `parseByExtension`. Documents uploaded to a KB are automatically chunked, embedded via Ollama `/api/embeddings` (default model `nomic-embed-text`), and stored in `kb_chunks` with JSON embeddings. At query time, the user question is embedded and cosine-similarity-ranked against all chunks. Chat integration: `buildKnowledgeBaseContext()` in ollama.ts retrieves Top‑5 chunks and injects them into `finalPrompt` before model dispatch, with the instruction "请优先基于这些信息回答，如果参考信息不足以回答问题，请如实说明". The KB context is never written to local history. KB selector available both in the welcome screen (inline next to model selector) and in MessageInput (compact dropdown). KB management through Settings "知识库" tab. Files reuse the `/api/parse-file` parsing pipeline (same as chat uploads).

**Edit safety**: When modifying HTML nesting in Svelte files, prefer self-contained edits where opening+closing tags balance within the replaced string. Avoid splitting edits across separate old/new pairs that touch overlapping regions — this pattern causes hard-to-debug nesting errors. Build with full output to catch Svelte parse errors. Use absolute paths when adding or reading files. Always run `npm run build` to verify changes compile.
