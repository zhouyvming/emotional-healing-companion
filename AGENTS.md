# AGENTS.md

## Commands

```bash
npm run dev       # dev server on http://localhost:8080 (NOT default 5173)
npm run build     # Vite build → build/ (adapter-node, run with `node build`)
npm run typecheck # TypeScript check via `tsc --noEmit`
npm run test      # Node test runner for scripts/*.test.mjs
npm run verify    # typecheck + build + test
npm run tts:download # download EmotiVoice source + outputs/SimBERT models under tools/tts-models/emotivoice
npm run tts:serve    # start full local TTS chain: upstream 127.0.0.1:8000 + worker 127.0.0.1:8510
npm run dev:tts      # run TTS worker + Vite dev server
npm run fmt       # Prettier 2 via npx -p (NOT local install)
```

Verification uses TypeScript, Vite build, and a small Node test suite. Still do manual browser verification for UI/chat/provider flows.

## Architecture gotchas

**SPA mode** (`ssr: false` in `src/routes/+layout.ts:3`). Auth is client-side only: JWT stored in `localStorage.user`, route guard checks it in `+layout.ts` load function. No server-side session.

**notifyUpdate pattern** — The single most important design quirk. Chat logic runs in `src/lib/chat/ollama.ts` / `openai.ts`, outside Svelte component scope. Mutations to `history` objects are invisible to Svelte's compiler. Components use `let updateCounter = 0` + `$: updateCounter, (() => { rebuild })();` and pass `c().notifyUpdate()` into the chat modules. Whenever you mutate history/stream responses, you MUST call `c().notifyUpdate()`. Also: use `c().messages` (not a destructured snapshot) for logic that needs latest data; use `currentCtx.autoScroll` (not the captured value) inside streaming loops.

**Reactive block guard**: `history.messages[history.currentId]` checked before traversal to prevent crashes when `currentId` points to a deleted message.

## Database

MySQL 8 on `localhost:3307` (override via `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE` env vars), database `webui_chat`. Connection pool at `src/lib/server/db.ts`.

Tables are auto-created AND auto-migrated with `ALTER TABLE ... .catch(() => {})` — this means migration DDL silently fails on existing columns. When adding a column, add it as a new `pool.execute(ALTER TABLE ...).catch(() => {})` block. Never remove or modify existing migration blocks.

**timestamp column**: migrated from `BIGINT` (ms) to `DATETIME` (ISO 8601 `YYYY-MM-DDTHH:MM:SS`). New code MUST use `datetimeNow()` from `src/lib/utils/index.ts`, not epoch milliseconds.

**Legacy passwords**: may be plaintext if not yet migrated via `scripts/migrate-passwords.ts`.

**TTS storage**: `tts_voices` is intentionally dropped at startup. Built-in TTS uses fixed EmotiVoice presets from code/`tools/tts-models/emotivoice/voices.json`; model files live under `tools/tts-models/emotivoice/` and are gitignored.

## Library quirks

- `svelte-french-toast` v1.x has NO `toast.info()` — use the generic `toast()` function instead.
- `prettier@2` is pinned, format is tabs + no trailing commas (`.prettierrc`).
- `bcryptjs` (pure JS), NOT `bcrypt` (native). JWT is custom HMAC-SHA256 via Node.js `crypto.createHmac`, not jsonwebtoken.
- `dompurify` for HTML sanitization (replaced regex-based XSS protection).

## Chat engine architecture

**Message routing**: Ollama models → `sendPromptOllama` (streaming SSE via Ollama `/api/chat`), third-party OpenAI-compatible → `sendPromptOpenAI` (same-origin streaming proxy `/api/openai-compatible/chat`). Models processed **sequentially** (not `Promise.all`) to avoid history corruption.

**Local OpenAI-compatible backends**: Settings can switch local model provider from Ollama to OpenAI-compatible (`settings.localModelProvider = "openai-compatible"`). vLLM, llama.cpp server, and LM Studio use `/api/local-openai/models` and `/api/local-openai/chat`; model names are surfaced as `local/<model-id>`. These routes require auth and only allow local/private base URLs. Ollama pull/delete/version checks are Ollama-only.

**Context compression**: Before sending to any model, total character count is estimated (chars/2 ≈ tokens). If exceeding `num_ctx * 0.85` (default 200K), oldest messages are truncated. A system note `[对话上下文已压缩：早期 N 条消息已省略]` is inserted. Local history is NOT modified.

**Web search injection**: if `settings.webSearch` is true, `submitPrompt()` calls `/api/web-search` before model dispatch and appends a `[联网搜索结果...]` block to the request-only `finalPrompt`. This context is NOT written into local history.

**File parsing injection**: uploads are read as data URLs in `MessageInput.svelte` / `Messages.svelte`. Non-image documents call authenticated `/api/parse-file`, which extracts text from `txt/md/csv/doc/docx/pdf/xls/xlsx/pptx` (`.doc` best-effort via `word-extractor`) and stores it on the in-memory upload object. `submitPrompt()` appends parsed file text to request-only `finalPrompt`; local message history stores only attachment metadata and preview labels, not the extracted text.

**Third-party models**: receive request-only user input + configured system prompt; if web search is enabled, the request-only input may include the search result block. Image uploads are sent as OpenAI vision content only for likely vision-capable models; otherwise they degrade to a text note.

**Ollama models**: receive request-only user input + system prompt (persona + emotion sensing); if web search is enabled, the request-only input may include the search result block.

**Abort mechanism**: `abortRefs` array (index-based, per-model) + `stopRef` boolean. `stopResponse()` sets `stopRef = true` and aborts all controllers in `abortRefs`.

**Message tree utilities**: `removeMessageBranch()` in `src/lib/utils/index.ts` handles recursive deletion with dangling `currentId` protection.

**TTS routing**: `/api/tts/voices`, `/api/tts/health`, and `/api/tts/speak` require auth. They expose only fixed EmotiVoice `voiceId`s and proxy synthesis to the local worker at `EMOTIVOICE_WORKER_URL` (default `http://127.0.0.1:8510`). Current presets include 温柔陪伴, 可爱元气, and 细腻共情. `npm run tts:serve` starts both the EmotiVoice OpenAI-compatible upstream on `127.0.0.1:8000` and the project worker on `127.0.0.1:8510`; install Python deps from `tools/tts-worker/requirements.txt`, `tools/tts-models/emotivoice/repo/requirements.txt`, and `tools/tts-models/emotivoice/repo/requirements.openaiapi.txt`. Do not accept arbitrary model paths, speaker files, or external URLs from the client. When `settings.ttsEnabled` is false, chat message read-aloud uses browser `speechSynthesis` via `src/lib/client/tts-player.ts` instead of calling `/api/tts/speak`.

## Third-party API models

Providers stored in `localStorage.apiProviders` (also synced to MySQL `api_providers` table for cross-browser support). Models named as `提供商名/模型ID` (provider-name/model-id). `sendPrompt` auto-routes: Ollama models → `sendPromptOllama`, third-party → `sendPromptOpenAI` via `findProvider()` matching by model name prefix.

**Provider sync**: `(app)/+layout.svelte` runs `syncProviders()` on load — fetches providers from `/api/providers` and writes to localStorage. SettingsModal saves to both localStorage and API simultaneously. `/api/providers` POST uses a transaction around delete+insert to avoid losing providers on partial failure.

**OpenAI-compatible proxy**: browser code MUST NOT call third-party `baseUrl` directly for chat/model list requests and MUST NOT send provider `apiKey`/`baseUrl` to proxy endpoints. Use `/api/openai-compatible/chat` and `/api/openai-compatible/models` with `providerId`; both routes are protected by `requireAuth()`, load the provider for the current username, validate configured model membership, and forward with the decrypted provider API key server-side. `/api/providers` GET returns masked keys only; masked keys in POST preserve the existing encrypted value. Provider base URLs are normalized and private/internal URLs are rejected.

**Default model**: New sessions default to first third-party model if any exist, then fall back to first Ollama model (`ModelSelector.svelte`). User can manually set a default via the settings panel "设为默认" button, which persists to `localStorage.settings.models` and takes priority over auto-selection. The compact model selector in the chat input no longer auto-saves on change.

## Auth / Security

- JWT secret overridable via `JWT_SECRET` env var. All API routes use `requireAuth()`.
- Client-side `authFetch` auto-attaches Bearer token and redirects to `/login` on 401.
- Registration + login rate-limited: 5 per minute per IP (in-memory Map).
- Password minimum 6 characters, enforced by both UI and server routes (`/api/auth`, `/api/user/profile`).
- Open Redirect protection: rejects `//evil.com` protocol-relative URLs.
- XSS: DOMPurify sanitizes all AI output before `{@html}` rendering.
- SSRF: `fetch-url` uses `redirect: manual`, `web-search` checks custom URLs via shared `isPrivateUrl()`.
- SSRF: third-party provider `baseUrl` is validated through `normalizeProviderBaseUrl()` in `src/lib/server/providers.ts`; private/internal hosts are rejected before storage/use.
- TOCTOU: `chats/[id]` PUT statement includes `AND username = ?`.
- Username changes sync ownership across `chats`, `api_providers`, `mood_history`, `advice_table`, and `feedback_table`, then issue a fresh token.
- **API key encryption**: `api_providers.api_key` is encrypted with AES-256-GCM (key derived from JWT_SECRET) before storage. `encryptApiKey()`/`decryptApiKey()` in `auth.ts`.
- **HTTP security headers**: `src/hooks.server.ts` sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` on all responses.
- **datetimeNow()** produces ISO 8601 format for native Safari/edge browser compatibility.

## References

- Full architecture docs: `CLAUDE.md`
- Implementation plan: `.claude/plans/`

## Recent changes (2026-05-30)

**Current verification status**: `npm run typecheck` passes, `npm run build` passes, and `/api/tts/voices` returns the 3 fixed EmotiVoice presets. The only expected build warning is the default JWT secret warning when `JWT_SECRET` is unset.

**TTS fallback/current state**: Built-in TTS remains local EmotiVoice only, with fixed presets 温柔陪伴, 可爱元气, and 细腻共情. The temporary fourth preset was removed. If a user clicks “朗读” without enabling built-in TTS, `Messages.svelte` now uses browser `speechSynthesis`. Yating TTS was evaluated but not integrated because its official API requires an API Key.

## Recent changes (2026-05-29)

**Verification update**: `npm run verify` now runs `typecheck + build + node --test scripts/*.test.mjs` and passes. `git diff --check` passes; the only runtime build warning is the default JWT secret warning when `JWT_SECRET` is unset. The earlier large chunk warning was removed by chunk splitting and highlight.js core imports.

**Provider/key hardening**: `src/lib/server/providers.ts` centralizes provider lookup, masked-key detection, model allow-list checks, and base URL normalization. OpenAI-compatible chat/model proxy routes now accept only `providerId` + payload, fetch provider credentials server-side, enforce user ownership, apply request timeouts, and classify upstream auth/rate-limit/server failures for clearer UI errors.

**Local backend support**: Added first-class support for vLLM, llama.cpp server, and LM Studio through a local OpenAI-compatible proxy. Configure it in Settings → General → Connection. Presets use LM Studio `http://localhost:1234/v1`, vLLM `http://localhost:8000/v1`, and llama.cpp `http://localhost:8081/v1` because this app runs on 8080; custom local/private URLs are accepted but must not match the app origin.

**Local proxy same-origin guard**: `/api/local-openai/*` rejects a base URL with the same origin as the current app. This prevents `http://localhost:8080/v1/models` from being routed back into SvelteKit and returning `Not found: /v1/models`.

**Knowledge base retry/status**: `kb_documents` now stores `source_type`, `source_data`, and `processed_at` for retryable processing. Upload processing marks `processing/done/error`, clears stale chunks before retry, cleans residual chunks after failure, and exposes `/api/knowledge-bases/[id]/documents/[docId]/retry`. `KnowledgeBaseDocuments.svelte` polls while work is pending/processing and shows retry for failed docs.

**Performance**: SettingsModal is lazy-loaded from `(app)/+layout.svelte`. `vite.config.ts` splits vendor chunks, and `Messages.svelte` imports `highlight.js/lib/core` with explicit language registration instead of the full bundle.

**Types/tests**: shared chat interfaces live in `src/lib/types/chat.ts`; `scripts/core-utils.test.mjs` covers private URL detection, safe JSON fallback, and chunk overlap behavior.

**OpenAI-compatible API proxy**: Added `/api/openai-compatible/chat` and `/api/openai-compatible/models`. `src/lib/chat/openai.ts` now sends third-party chat, title generation, and model-list requests through same-origin authenticated server routes instead of browser-direct provider URLs. This fixes CORS/network-surface `Failed to fetch` errors in the in-app browser.

**TypeScript/build cleanup**: `vite.config.ts` now patches SvelteKit's generated `ignoreDeprecations` to `5.0`; route handlers have explicit request/url typings; `safeJsonParse()` supports an omitted fallback; `src/word-extractor.d.ts` declares the `.doc` parser package; GBK web-search decoding uses `TextDecoder("gbk")`.

**Accessibility**: `KnowledgeBaseManager.svelte` no longer uses a visible clickable `<div>` for expansion. The row uses real buttons for keyboard-accessible expand/collapse and delete controls, clearing the Svelte a11y warning.

**Security hardening**: API keys encrypted in database, login rate limiting added, HTTP security headers (CSP/X-Frame-Options/X-Content-Type-Options), JWT secret default triggers runtime warning, `viewport` meta no longer restricts zoom.

**Code deduplication**: `src/lib/chat/prompts.ts` shared module — `buildSystemPrompt()` (emotion sensing + Markdown instruction) and `compressContext()` (token-aware truncation) used by both ollama.ts and openai.ts. `safeJsonParse()` consolidated from 4 route-level copies into `src/lib/utils/index.ts`. `parseByExtension()` exported from knowledge-base.ts, reused by `/api/parse-file`.

**UX**: Loading spinner on chat page when `loaded=false`, empty-state guidance in KnowledgeBaseDocuments and KnowledgeBaseSelector, `+layout.js` → `+layout.ts` for type safety.

**Layout**: User messages now left-aligned (avatar on left, `items-start`/`justify-start`). Avatars enlarged to `w-10 h-10` (40px). Bubble has `w-fit` (content-width, no stretching) and NO `break-words` (was causing premature line wraps in Chinese text).

**Timestamp alignment**: Instead of manual `ml-13` (52px = 40px avatar + 12px gap), timestamp rows use a flex spacer pattern — `<div class="flex justify-start items-center gap-3"><div class="w-10"></div><div class="flex items-center gap-1">...</div></div>` — identical flex structure to the avatar+bubble row, guaranteeing alignment without fragile margin calculations.

**Markdown output**: Both `ollama.ts` and `openai.ts` system prompts now always include a hardcoded Markdown formatting instruction (independent of user-defined system prompt or emotion sensing toggle). The rendering pipeline (`marked` → `DOMPurify` → `{@html}`) handles both Ollama and third-party API outputs identically.

**P0/P1 fixes**: `svelte.config.js` now uses `@sveltejs/adapter-node` to match `node build`. Web search is wired into chat requests. Provider saves are transactional. Settings save awaits store/localStorage update before remote sync. Server-side password length validation is enforced. Username changes sync all username-owned tables. OpenAI-compatible image messages use typed vision content when appropriate and degrade to text for non-vision models.

**Knowledge base (RAG)**: `src/lib/server/knowledge-base.ts` provides `chunkText`, `cosineSimilarity`, `getOllamaEmbedding`, `queryKnowledgeBase`, `processDocument`, and `parseByExtension`. Documents uploaded to a KB are automatically chunked, embedded via Ollama `/api/embeddings` (default model `nomic-embed-text`), and stored in `kb_chunks` with JSON embeddings. At query time, the user question is embedded and cosine-similarity-ranked against all chunks. Chat integration: `buildKnowledgeBaseContext()` in ollama.ts retrieves Top‑5 chunks and injects them into `finalPrompt` before model dispatch, with the instruction "请优先基于这些信息回答，如果参考信息不足以回答问题，请如实说明". The KB context is never written to local history. KB selector available both in the welcome screen (inline next to model selector) and in MessageInput (compact dropdown). KB management through Settings "知识库" tab. Files reuse the `/api/parse-file` parsing pipeline (same as chat uploads).

**Edit safety**: When modifying HTML nesting in Svelte files, prefer self-contained edits where opening+closing tags balance within the replaced string. Avoid splitting edits across separate old/new pairs that touch overlapping regions — this pattern causes hard-to-debug nesting errors. Build with full output to catch Svelte parse errors. Use absolute paths when adding or reading files. Always run `npm run build` to verify changes compile.
