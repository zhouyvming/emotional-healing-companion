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

## Database

MySQL 8 on `localhost:3307`, root/no-password, database `webui_chat`. Connection pool at `src/lib/server/db.ts:4`.

Tables are auto-created AND auto-migrated with `ALTER TABLE ... CATCH(() => {})` — this means migration DDL silently fails on existing columns. When adding a column, add it as a new `pool.execute(ALTER TABLE ...).catch(() => {})` block. Never remove or modify existing migration blocks.

**timestamp column**: migrated from `BIGINT` (ms) to `DATETIME` (`YYYY-MM-DD HH:MM:SS`). New code MUST use `datetimeNow()` from `src/lib/utils/index.ts`, not epoch milliseconds.

**Legacy passwords**: may be plaintext if not yet migrated via `scripts/migrate-passwords.ts`.

## Library quirks

- `svelte-french-toast` v1.x has NO `toast.info()` — use the generic `toast()` function instead.
- `prettier@2` is pinned, format is tabs + no trailing commas (`.prettierrc`).
- `bcryptjs` (pure JS), NOT `bcrypt` (native). JWT is custom HMAC-SHA256 via `js-sha256`, not jsonwebtoken.

## Third-party API models

Providers stored in `localStorage.apiProviders`. Models named as `提供商名/模型ID` (provider-name/model-id). `sendPrompt` auto-routes: Ollama models → `sendPromptOllama`, third-party → `sendPromptOpenAI` via `findProvider()` matching by model name prefix.

## Auth / Security

JWT secret is hardcoded, overridable via `JWT_SECRET` env var. All 8 API routes use `requireAuth()` from `src/lib/server/auth.ts`. Client-side `authFetch` in `src/lib/client/http.ts` auto-attaches Bearer token and redirects to `/login` on 401.

## References

- Full architecture docs: `CLAUDE.md`
- Product improvement docs: `系统后期优化改进.md`, `系统后期优化改进2.md`, `系统后期优化改进3.md`
