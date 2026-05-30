# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev       # 启动开发服务器，运行在 http://localhost:8080（注意非默认5173端口）
npm run build     # Vite 生产构建，产物在 build/ 目录，使用 adapter-node，运行 `node build`
npm run typecheck # TypeScript 检查
npm run test      # Node test runner，执行 scripts/*.test.mjs
npm run verify    # typecheck + build + test
npm run fmt       # Prettier 2 格式化（通过 npx -p 运行，非本地安装）
```

项目已有基础 Node 测试套件；UI、聊天流、Provider 配置和知识库交互仍需手动浏览器验证。

代码风格：Prettier 2，**Tab 缩进** + **无尾逗号** + 100 字符行宽（见 `.prettierrc`）。

## 项目概述

SvelteKit 1.x + Svelte 4 应用，SPA 模式（`ssr: false`）。品牌名"情感疗愈伴侣"——粉色主题的中文情感支持聊天机器人，支持 **Ollama 本地模型** + **本地 OpenAI-compatible 后端**（vLLM / llama.cpp / LM Studio）+ **第三方 OpenAI 兼容 API**（OpenAI / DeepSeek / 通义千问等），具备 **RAG 知识库**功能（文档上传 → 向量检索 → 对话注入）。

## 最新状态（2026-05-30）

- README 已精简重构，并在技术栈部分新增 Mermaid 系统架构图和核心流程图；MySQL 默认连接说明已标注配置文件 `src/lib/server/db.ts` 与 `MYSQL_*` 环境变量覆盖；第三方 API 配置文案统一为 `Base URL（OpenAI兼容）`。这轮文档改动已通过 `git diff --check`。
- `npm run verify` 通过（`typecheck + build + node --test`）；`git diff --check` 通过。当前构建只剩未设置 `JWT_SECRET` 时的默认 secret 警告。
- 第三方 OpenAI 兼容模型已改为同源后端代理：聊天/标题生成走 `/api/openai-compatible/chat`，模型列表走 `/api/openai-compatible/models`。前端只传 `providerId`，服务端按当前登录用户读取 provider、解密 API Key、校验模型列表并转发，避免浏览器直连 provider URL 时出现 CORS 导致的 `Failed to fetch`。
- 本地模型后端新增 OpenAI-compatible 模式：支持 vLLM、llama.cpp server、LM Studio，聊天/标题生成走 `/api/local-openai/chat`，模型列表走 `/api/local-openai/models`，模型名显示为 `local/<model-id>`。
- 本地 OpenAI-compatible 代理会拒绝当前应用自身 origin，避免误填 `http://localhost:8080/v1` 时把 `/v1/models` 打回 SvelteKit 导致 404；llama.cpp 预设为 `http://localhost:8081/v1`。
- `/api/providers` GET 返回脱敏 API Key；POST 收到脱敏 Key 时保留现有加密值。Provider base URL 会规范化并拒绝私网/本机地址。
- 知识库文档处理状态已增强：保存原始 `source_type/source_data`，支持 `processing/done/error`、错误记录、轮询刷新和失败重试接口。
- `SettingsModal.svelte` 改为懒加载；Vite vendor chunk 已拆分；`Messages.svelte` 使用 `highlight.js/lib/core` 并按需注册语言，消除大 chunk 警告。
- `KnowledgeBaseManager.svelte` 的展开/删除交互已改为真实按钮，修复 Svelte a11y click/keyboard/role 警告。
- `vite.config.ts` 的 generated tsconfig patch 使用 `ignoreDeprecations: "5.0"`；路由 handler 类型、`safeJsonParse()`、`word-extractor` 类型声明、GBK 解码均已清理到可通过 typecheck。

## 项目启动与依赖

完整部署流程见 [README.md](./README.md)。关键外部依赖：

- **MySQL 8**：`localhost:3307`，root 无密码，数据库 `webui_chat`（可通过 `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE` 环境变量覆盖）
- **Ollama**：`http://localhost:11434/api`（可在设置中修改）

## 路由结构

```
src/routes/
├── +layout.ts                              # 路由守卫（JWT token 检查，未登录跳转 /login）
├── +layout.svelte                          # 根布局（全局 CSS + Toast 挂载）
├── +error.svelte                           # 错误页面
├── login/+page.svelte                      # 登录页（密码可见性切换，防协议相对 URL Open Redirect）
├── register/+page.svelte                   # 注册页（密码最短6位，Open Redirect 防护）
├── (app)/
│   ├── +layout.svelte                      # 应用布局（模型加载、DB初始化、IndexedDB→MySQL迁移、Ollama版本检查，第三方模型合并与双向同步，Ctrl+N 全局快捷键）
│   ├── +page.svelte                        # 新对话页（首页）
│   ├── chat/[id]/+page.svelte               # 对话详情页（重命名、删除、流式中断恢复提示）
│   └── profile/+page.svelte               # 个人资料页（头像/用户名/邮箱/密码修改、导出所有会话JSON/MD、退出确认、建议反馈按钮跳转）
├── advice_table/+page.svelte               # 建议与反馈提交页
├── favicon.ico/+server.ts                  # favicon 静默返回 204
├── .well-known/[...path]/+server.ts        # Chrome DevTools 探测请求静默处理（返回 204）
└── api/
    ├── auth/+server.ts                     # POST 登录/注册（bcryptjs + JWT，注册速率限制 5次/分钟/IP，服务端密码最短6位）
    ├── user/profile/+server.ts             # PUT 用户资料（用户名改时同步所有username归属表+签发新token）
    ├── chats/+server.ts                    # GET(分页)/POST(创建/更新)/DELETE(全部) 聊天
    ├── chats/[id]/+server.ts              # GET/PUT/DELETE 单条聊天（PUT 含 AND username = ? 防 TOCTOU）
    ├── advice_table/+server.ts             # POST 提交建议
    ├── feedback_table/+server.ts           # POST 提交反馈
    ├── fetch-url/+server.ts               # POST 抓取网页文本（redirect: manual 防 SSRF 重定向，1MB 上限）
    ├── providers/+server.ts               # GET(按用户列表)/POST(事务式全量保存) API 提供商配置（跨浏览器同步）
    ├── openai-compatible/chat/+server.ts  # POST 同源代理 OpenAI-compatible /chat/completions（流式透传，避免 CORS）
    ├── openai-compatible/models/+server.ts # POST 同源代理 OpenAI-compatible /models（刷新第三方模型列表）
    ├── local-openai/chat/+server.ts       # POST 本地 OpenAI-compatible /chat/completions（vLLM/llama.cpp/LM Studio）
    ├── local-openai/models/+server.ts     # POST 本地 OpenAI-compatible /models
    ├── web-search/+server.ts              # POST 联网搜索（Bing/百度/DDG 多引擎，isPrivateUrl 防 SSRF）
    ├── knowledge-bases/+server.ts         # GET(列表)/POST(创建) 知识库
    ├── knowledge-bases/[id]/+server.ts    # DELETE 级联删除
    ├── knowledge-bases/[id]/documents/+server.ts # GET(列表)/POST(上传，复用parse-file)
    ├── knowledge-bases/[id]/documents/[docId]/retry/+server.ts # POST 失败文档重试
    └── knowledge-bases/[id]/query/+server.ts # POST 向量检索 Top-K
```

所有 API 路由均受 `requireAuth()` 保护，从 JWT Bearer token 提取用户身份。

**SPA 模式**：`ssr: false`（`src/routes/+layout.ts`），认证完全在客户端进行——JWT 存储在 `localStorage.user`，路由守卫在 `+layout.ts` 的 load 函数中检查，无服务端 session。

## 认证体系 (`src/lib/server/auth.ts`)

- `hashPassword(p)` / `verifyPassword(p, hash)` — bcryptjs（纯 JS，盐轮 10）
- `signToken({userId, username})` / `verifyToken(token)` — 自定义 HMAC-SHA256 JWT（基于 Node.js `crypto.createHmac`），7 天有效期
- `requireAuth(request)` — 从 Authorization header 提取 Bearer token 并验证，失败抛出 `AuthError`
- Secret 默认硬编码，可通过 `JWT_SECRET` 环境变量覆盖

## 数据存储

**MySQL**（主存储，`mysql2/promise`）：连接池 `src/lib/server/db.ts`，`webui_chat` / `localhost:3307`。

表（自动初始化 + 追加列迁移）：
| 表 | 关键列 |
|----|--------|
| `users` | `id`(AUTO_INCREMENT PRIMARY KEY), `username`(UNIQUE), `password`(VARCHAR bcryptjs), `email`, `avatar`(LONGTEXT base64), `system_avatar`(LONGTEXT base64) |
| `chats` | `id`(UUID PK), `username`, `title`, `models`(JSON), `options`(JSON), `messages`(JSON), `history`(JSON), `system`(TEXT), `timestamp`(DATETIME, `YYYY-MM-DD HH:MM:SS`) |
| `feedback_table` | `id`, `username`, `content`, `created_at`(TIMESTAMP) |
| `advice_table` | `id`, `username`, `content`, `created_at`(TIMESTAMP) |
| `api_providers` | `id`(VARCHAR 36 PK), `username`, `name`, `base_url`(TEXT), `api_key`(TEXT, AES-256-GCM 加密), `models`(JSON), `created_at`(TIMESTAMP) |
| `knowledge_bases` | `id`(VARCHAR 36 PK), `username`, `name`, `embedding_model`(默认 nomic-embed-text), `chunk_size`(默认 500), `created_at`(TIMESTAMP) |
| `kb_documents` | `id`(VARCHAR 36 PK), `kb_id`, `filename`, `status`(pending/processing/done/error), `chunk_count`, `error_message`(TEXT), `source_type`, `source_data`, `processed_at`, `created_at`(TIMESTAMP) |
| `kb_chunks` | `id`(VARCHAR 36 PK), `doc_id`, `kb_id`, `content`(TEXT), `chunk_index`, `embedding`(JSON 浮点数组), `created_at`(TIMESTAMP) |

**timestamp 迁移**：2026-05 从 `BIGINT` 毫秒时间戳迁移为 `DATETIME`。`db.ts` 中 `UPDATE FROM_UNIXTIME` 自动转换已有数据。**新代码必须使用 `datetimeNow()`（ISO 8601 格式 `YYYY-MM-DDTHH:MM:SS`），禁止使用 epoch 毫秒。**

**迁移模式**：DDL 迁移使用 `pool.execute(ALTER TABLE ...).catch(() => {})` 模式——已有列会静默失败。添加新列时追加一个新的 `.catch(() => {})` 块，**绝不修改或删除已有迁移块**。

**IndexedDB→MySQL 迁移**：`+layout.svelte` 中 `migrateFromIndexedDB()`，成功后设 localStorage 标记。若整体迁移异常则**不标记完成**，允许下次重试。

**密码迁移脚本**：`scripts/migrate-passwords.ts` 用于将旧密码迁移为 bcryptjs 格式。注意：未迁移的旧密码可能是明文。

**API 提供商配置**：第三方 API 提供商（名称/URL/Key/模型列表）存储在 `localStorage.apiProviders`，设置面板「API」标签管理。**已实现 MySQL `api_providers` 表跨浏览器同步**：`+layout.svelte` 启动时调用 `syncProviders()` 同步 API→localStorage，`SettingsModal.svelte` 保存时同时写 localStorage 和 POST `/api/providers`，保存后重新拉取脱敏 provider 列表。`/api/providers` POST 使用事务包裹 delete+insert，避免部分失败导致配置丢失；脱敏 Key 会保留现有加密值。

**用户名变更同步**：`user/profile` 改名时同步 `chats`、`api_providers`、`mood_history`、`advice_table`、`feedback_table` 的 `username` 字段，并签发新 token。新增 username 归属表时必须补充此同步逻辑，除非表已经迁移到 `user_id`。

## 状态管理 (`src/lib/stores/index.ts`)

| Store          | 类型                                                     | 用途                                                                                                                                         |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `info`         | `{}`                                                     | Ollama 服务信息（版本号）                                                                                                                    |
| `db`           | `undefined \| object`                                    | MySQL API 包装实例                                                                                                                           |
| `chatId`       | `string`                                                 | 当前对话 UUID                                                                                                                                |
| `chats`        | `[]`                                                     | `{id, title, timestamp}` 列表，侧边栏数据源                                                                                                  |
| `models`       | `[]`                                                     | 合并后的所有可用模型（Ollama 本地 + 第三方 API），ModelSelector 数据源                                                                       |
| `user`         | `{id, username, email, avatar?, system_avatar?} \| null` | 当前登录用户                                                                                                                                 |
| `settings`     | `Settings`                                               | 应用设置（含 API_BASE_URL、theme、fontSize、systemName、systemPrompt、proactiveGreeting、privacyMode 等），类型已完善，持久化到 localStorage |
| `showSettings` | `boolean`                                                | 设置弹窗开关                                                                                                                                 |
| `moodHistory`  | `{date, mood, score}[]`                                  | 情绪追踪数据                                                                                                                                 |

## 共享模块

| 文件                               | 内容                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/chat/prompts.ts`          | `buildSystemPrompt`(情绪感知+Markdown)、`compressContext`(上下文压缩)，被 ollama.ts/openai.ts 共享                                                                                                                                                                                                                                                                                                                            |
| `src/lib/chat/ollama.ts`           | `sendPromptOllama`（流式 Ollama，AbortController 真正取消）、`sendPrompt`（顺序路由 Ollama/OpenAI，非并发）、`submitPrompt`（文件提取 + 联网搜索结果注入到本次请求）、`generateChatTitle`、`stopResponse`（abortRefs 数组 + stopRef）、`regenerateResponse`、`editMessage`、`deleteMessage`。system prompt 含情绪感知指引 + **硬编码 Markdown 格式输出指令**（始终生效）。                                                    |
| `src/lib/chat/openai.ts`           | `sendPromptOpenAI`（OpenAI 兼容流式，120s 超时 + 60s stream 读取超时，通过 `/api/openai-compatible/chat` 同源代理转发）、`findProvider`、`getThirdPartyModels`、`fetchModels`（通过 `/api/openai-compatible/models` 转发）。system prompt 含情绪感知指引 + **硬编码 Markdown 格式输出指令**（始终生效）。第三方模型接收本次请求输入 + system prompt；图片对可能支持视觉的模型使用 OpenAI vision content，否则降级为文本说明。 |
| `src/lib/client/fileParser.ts`     | 前端上传文件解析协调：图片跳过解析，txt/md/csv/doc/docx/pdf/xls/xlsx/pptx 调用 `/api/parse-file`，维护 `parseStatus`/`parseError` 并显示上传、完成、解析中的 toast。                                                                                                                                                                                                                                                          |
| `src/lib/server/auth.ts`           | bcryptjs 哈希、JWT 签发/验证、`requireAuth` 中间件                                                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/server/providers.ts`      | `maskApiKey`/`isMaskedApiKey`、`normalizeProviderBaseUrl`、`getProviderForUser`、`providerAllowsModel`，统一处理 Provider 脱敏、私网 URL 阻断、用户归属查询和模型白名单校验                                                                                                                                                                                                                                                   |
| `src/lib/server/local-openai.ts`   | `normalizeLocalOpenAIBaseUrl`、`localOpenAIHeaders`，供本地 vLLM/llama.cpp/LM Studio 代理路由复用；仅允许本机或内网地址                                                                                                                                                                                                                                                                                                       |
| `src/lib/server/db.ts`             | MySQL 连接池 + 9 张表 DDL + 列迁移。支持环境变量配置                                                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/client/http.ts`           | `authFetch`（自动附加 JWT Bearer，401 清除登录态并跳转，Content-Type 仅未设置时覆盖）、`getToken`、`getCurrentUser`                                                                                                                                                                                                                                                                                                           |
| `src/lib/utils/index.ts`           | `splitStream`、`safeJsonParse`(JSON 解析兜底)（SSE 流式解析，\r\n 归一化）、`convertMessagesToHistory`（消息数组 → 树形结构）、`datetimeNow()`、`isPrivateUrl()`（共享 SSRF 检查）、`removeMessageBranch()`（消息树递归删除 + currentId 防悬挂）                                                                                                                                                                              |
| `src/lib/server/knowledge-base.ts` | `chunkText`(固定大小切片+overlap)、`cosineSimilarity`(余弦相似度)、`getOllamaEmbedding`(调用 Ollama /api/embeddings)、`queryKnowledgeBase`(Embed 查询 → Top-K)、`processDocument`(文本提取 → 切片 →embed→ 入库)、`parseByExtension`(文件解析，与 /api/parse-file 共享实现)                                                                                                                                                    |

## 响应式核心机制：notifyUpdate

由于聊天核心逻辑在 `ollama.ts` / `openai.ts` 外部模块中，对 `history` 对象的属性变更（mutation）发生在组件作用域之外。通知机制：

1. 组件内 `let updateCounter = 0` + `$: updateCounter, (() => { rebuild from history.currentId })()`
2. `getCtx()` 返回 `notifyUpdate: () => { updateCounter++ }` 闭包
3. 每次修改 history 后调用 `c().notifyUpdate()`
4. reactive block **守卫** `history.messages[history.currentId]` 防止悬挂引用崩溃
5. 需要最新数据时用 `c().messages` 而非局部快照
6. 流式循环中用 `currentCtx.autoScroll` 实时值

## 聊天引擎核心设计

**消息路由**：`sendPrompt` 识别模型类型（含 `/` 为第三方），路由到 `sendPromptOpenAI` 或 `sendPromptOllama`。模型调用已改为**顺序执行**（for...of），避免并发 history 写入竞态。

**联网搜索注入**：如果 `settings.webSearch` 为 true，`submitPrompt()` 在模型调用前请求 `/api/web-search`，把前 5 条结果拼成 `[联网搜索结果，仅供回答时参考，不代表本地对话历史]` 附加到 `finalPrompt`。该内容仅用于本次请求，不写入 `history.messages[userMessageId].content`。

**文件解析注入**：上传时先显示“正在上传文件/已上传文件”，非图片文件随后显示“正在解析文件内容”并调用认证接口 `/api/parse-file`。服务端解析 `txt/md/csv/doc/docx/pdf/xls/xlsx/pptx`，其中 `.doc` 为 best-effort。发送时 `ensureFilesParsed()` 会补齐尚未完成的解析，再把解析文本附加到请求级 `finalPrompt`；本地历史只保存附件名称/类型/状态，不保存完整提取文本。

**上下文自动压缩**：发送前估算 tokens（字符数/2），超出 `num_ctx × 0.85`（默认 200K）时截断最早消息，注入 `[对话上下文已压缩：早期 N 条消息已省略]`。本地 history 不受影响。

**停止响应**：`stopRef`（共享 boolean）+ `abortRefs`（数组，每个模型独立 index）。`stopResponse()` 同时设 stopRef 和 abort 所有活跃控制器。完成后按 index splice 清理自身。

**消息树操作**：`removeMessageBranch()` 在 `utils/index.ts` 中统一实现递归删除 + 悬挂 currentId 保护。`deleteMessage` 和 `editMessage` 共用此函数。

## 第三方 API 提供商架构

提供商配置存储于 `localStorage.apiProviders`，格式：

```json
[
	{
		"id": "xxx",
		"name": "DeepSeek",
		"baseUrl": "https://api.deepseek.com/v1",
		"apiKey": "sk-...",
		"models": [{ "id": "deepseek-chat", "name": "deepseek-chat" }]
	}
]
```

- `findProvider()` 通过模型名前缀匹配（`提供商名/模型ID` 格式）自动路由
- 前端不再直接请求第三方 `baseUrl`，也不再向代理接口提交 API Key/baseUrl。模型列表、聊天流、标题生成都经由受 `requireAuth()` 保护的 `/api/openai-compatible/*` 后端代理，前端只提交 `providerId`；服务端校验 provider 属于当前用户、模型在该 provider 配置列表中，再携带解密后的 provider API key 转发到上游，避免浏览器 CORS `Failed to fetch`
- `/api/providers` GET 只返回脱敏 Key；设置面板保存后会重新拉取脱敏列表。POST 时如果传入脱敏 Key，会保留数据库中已有加密 Key；传入新 Key 才重新加密保存
- Provider `baseUrl` 通过 `normalizeProviderBaseUrl()` 规范化，仅允许 http/https，并拒绝 localhost、私网和内网地址
- 第三方模型发送**本次请求输入** + 用户设定的 system prompt；联网搜索结果如果启用会随本次请求输入附加，但不写入历史
- 第三方模型图片输入：可能支持视觉的模型使用 OpenAI `image_url` content；其他模型降级为文本提示，避免非视觉 API 报错

## 本地 OpenAI-compatible 后端

本地模型后端由 `settings.localModelProvider` 控制：

- `"ollama"`：沿用 Ollama `/tags`、`/chat`、`/generate`、`/pull`、`/delete`、`/version`
- `"openai-compatible"`：使用 `/api/local-openai/models` 和 `/api/local-openai/chat` 代理到本地 OpenAI-compatible 服务

支持预设：

- LM Studio：`http://localhost:1234/v1`
- vLLM：`http://localhost:8000/v1`
- llama.cpp server：`http://localhost:8081/v1`（项目默认占用 8080，需要给 llama.cpp 换端口）

本地兼容模型在前端统一显示为 `local/<model-id>`，聊天发送前用 `getLocalOpenAIModelId()` 还原真实模型 ID。`normalizeLocalOpenAIBaseUrl()` 只允许本机或内网 URL；`assertNotSameOriginLocalBackend()` 会拒绝当前应用自身 origin，避免把 `http://localhost:8080/v1/models` 打回 SvelteKit 导致 404。这与第三方 Provider 的 SSRF 策略相反，第三方 Provider 必须是公网地址。

## 聊天消息数据模型

树形结构：每条消息 `{id, parentId, childrenIds[], role, content, images?, files?, model?, timestamp?, done?, error?, info?}`。`history = {messages: {messageId → message}, currentId}`。`messages` 从 `currentId` 上溯到根构建线性数组。

## 核心组件

| 组件                              | 位置    | 关键特性                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Messages.svelte**               | chat/   | Markdown（`marked` + DOMPurify 净化）、代码高亮（`highlight.js`）、LaTeX（`KaTeX`）、复制+MD 复制、tippy.js tooltip、分支导航、图片缩略图+附件标签、**消息编辑+删除按钮**。用户消息左对齐（头像在左，气泡 w-fit 无 break-words），时间戳行用 flex spacer（`<div class="w-10">`）对齐气泡左边缘。 |
| **MessageInput.svelte**           | chat/   | 固定底部、自动伸缩（max 200px）、发送/停止按钮、语音输入（onDestroy 中止）、文件/图片上传（粘贴/拖拽/选择，10MB 限制，Office/PDF 解析状态展示）、Enter 发送/Shift+Enter 换行、**visualViewport 移动端键盘适配**                                                                                                              |
| **ModelSelector.svelte**          | chat/   | `<select>` 下拉、自动选中首个可用模型（第三方优先）、设为默认模型持久化（设置面板）。紧凑模式不再自动保存选中变更。                                                                                                                                                                                                          |
| **SettingsModal.svelte**          | chat/   | 8 标签页：常规（外观+连接+系统头像）、知识库（创建/上传文档）、偏好与人设（7 项开关含情绪感知+AI 名称+system prompt）、模型与 API（拉取/列表/删除/设为默认+第三方提供商管理+添加表单折叠）、高级（seed/temperature/**num_ctx 默认 200K 范围 512-200K** 全部参数显示滑块默认值）、关于                                        |
| **KnowledgeBaseDocuments.svelte** | chat/   | 知识库文档列表、上传状态展示、pending/processing 自动轮询、error 状态重试、删除文档                                                                                                                                                                                                                                          |
| **Sidebar.svelte**                | layout/ | 260px、新对话、搜索、按日期分组（可折叠）、对话置顶（pinnedChats）、删除、设置+用户入口、**退出登录（localStorage.removeItem + goto /login）**、移动端遮罩、启动时不闪屏。导出功能已移至个人主页。                                                                                                                           |
| **Navbar.svelte**                 | layout/ | 对话标题（可重命名）、新对话按钮、删除确认                                                                                                                                                                                                                                                                                   |
| **Modal.svelte**                  | common/ | 通用弹窗容器（点击背景关闭）                                                                                                                                                                                                                                                                                                 |

## 样式与主题

Tailwind CSS，`class` 策略暗色模式。主题初始化在 `app.html` 中同步执行防止闪烁。字体大小通过 `--font-size-scale` CSS 变量控制。主色系：`pink-500`。

## 多模型支持

`selectedModels` 数组支持同时选多个模型（Ollama 本地 + 第三方 API 混合），`sendPrompt` 使用 **for...of 顺序**向各模型发送 prompt，各自产生独立回复分支。

## 停止响应机制（AbortController）

两层机制：

1. `stopRef`：流式循环每轮检查
2. `abortRefs`：每个模型独立 index，`stopResponse()` 遍历全部 abort。完成后 splice 自身索引，不影响其他模型。

## 安全加固

- **Open Redirect**：login/register 拒绝 `//evil.com` 协议相对 URL
- **SSRF**：`fetch-url` 用 `redirect: manual` 防重定向绕过；`isPrivateUrl()` 共享于 `fetch-url` 和 `web-search`
- **Provider SSRF**：第三方 Provider base URL 入库前用 `normalizeProviderBaseUrl()` 校验并拒绝本机/私网地址
- **Provider Key 保护**：浏览器不接收明文 API Key；Provider 列表只返回脱敏值，代理路由服务端读取并解密真实 Key
- **XSS**：DOMPurify 净化所有 `{@html}` 渲染的 AI 输出
- **TOCTOU**：`chats/[id]` PUT 语句含 `AND username = ?`
- **速率限制**：注册 + 登录 5 次/分钟/IP（内存 Map）
- **密码**：最短 6 位，前端和服务端注册/改密接口均校验
- **参数化查询**：所有 SQL 用 `?` 占位符

## 关键依赖

| 包                                  | 用途                                    |
| ----------------------------------- | --------------------------------------- |
| `bcryptjs`                          | 密码哈希（纯 JS）                       |
| `mysql2/promise`                    | MySQL 连接池 + 参数化查询               |
| `marked` + `highlight.js` + `kaTeX` | Markdown 渲染 + 代码高亮 + 数学公式     |
| `dompurify`                         | HTML 净化（替代正则 XSS 防护）          |
| `svelte-french-toast`               | Toast 通知（v1.x，无 `toast.info`）     |
| `tippy.js`                          | 消息 info tooltip（token/s 等流式指标） |
| `uuid`                              | 消息 ID / 会话 ID 生成                  |
| `idb`                               | IndexedDB 操作（仅用于旧数据迁移）      |

## 验证与测试

- `npm run typecheck`：TypeScript 检查
- `npm run build`：SvelteKit/Vite 生产构建
- `npm run test`：Node test runner，执行 `scripts/*.test.mjs`
- `npm run verify`：串行执行 typecheck、build、test

当前 `scripts/core-utils.test.mjs` 覆盖私网 URL 检测、`safeJsonParse` 兜底和知识库 chunk overlap。新增共享工具或高风险服务端逻辑时优先补充这里的纯函数测试；聊天流和浏览器交互仍需手动验证。
