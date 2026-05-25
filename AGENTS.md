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

**Third-party models**: receive raw user input + configured system prompt only. No web search, URL fetching, or date injection.

**Ollama models**: receive user input + system prompt (persona + emotion sensing). No web search or URL fetching.

**Abort mechanism**: `abortRefs` array (index-based, per-model) + `stopRef` boolean. `stopResponse()` sets `stopRef = true` and aborts all controllers in `abortRefs`.

**Message tree utilities**: `removeMessageBranch()` in `src/lib/utils/index.ts` handles recursive deletion with dangling `currentId` protection.

## Third-party API models

Providers stored in `localStorage.apiProviders` (also synced to MySQL `api_providers` table for cross-browser support). Models named as `提供商名/模型ID` (provider-name/model-id). `sendPrompt` auto-routes: Ollama models → `sendPromptOllama`, third-party → `sendPromptOpenAI` via `findProvider()` matching by model name prefix.

**Provider sync**: `(app)/+layout.svelte` runs `syncProviders()` on load — fetches providers from `/api/providers` and writes to localStorage. If API returns empty but localStorage has data, uploads to API. SettingsModal saves to both localStorage and API simultaneously.

**Default model**: New sessions default to first third-party model if any exist, then fall back to first Ollama model (`ModelSelector.svelte`). User can manually set a default via the settings panel "设为默认" button, which persists to `localStorage.settings.models` and takes priority over auto-selection. The compact model selector in the chat input no longer auto-saves on change.

## Auth / Security

- JWT secret overridable via `JWT_SECRET` env var. All API routes use `requireAuth()`.
- Client-side `authFetch` auto-attaches Bearer token and redirects to `/login` on 401.
- Registration rate-limited: 5 per minute per IP (in-memory Map).
- Password minimum 6 characters.
- Open Redirect protection: rejects `//evil.com` protocol-relative URLs.
- XSS: DOMPurify sanitizes all AI output before `{@html}` rendering.
- SSRF: `fetch-url` uses `redirect: manual`, `web-search` checks custom URLs via shared `isPrivateUrl()`.
- TOCTOU: `chats/[id]` PUT statement includes `AND username = ?`.

## References

- Full architecture docs: `CLAUDE.md`
- Product improvement docs: `系统后期优化改进.md`, `系统后期优化改进2.md`, `系统后期优化改进3.md`
