# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev       # 启动开发服务器（cross-env LANG=zh_CN.UTF-8），运行在 http://localhost:8080
npm run build     # Vite 生产构建，产物在 build/ 目录，使用 adapter-node
npm run fmt       # 用 Prettier 2 格式化 Svelte + JS/CSS/MD/HTML/JSON 文件（通过 npx -p 运行）
```

本项目没有测试套件。

## 项目概述

SvelteKit 1.x + Svelte 4 应用，SPA 模式（`ssr: false`）。品牌名"情感疗愈伴侣"——粉色主题的中文情感支持聊天机器人，支持 **Ollama 本地模型** + **第三方 OpenAI 兼容 API**（OpenAI / DeepSeek / 通义千问等）。

## 项目启动与依赖

完整部署流程见 [README.md](./README.md)。关键外部依赖：
- **MySQL 8**：`localhost:3307`，root 无密码，数据库 `webui_chat`（应用自动建表）
- **Ollama**：`http://localhost:11434/api`（可在设置中修改）

## 路由结构

```
src/routes/
├── +layout.js                              # 路由守卫（JWT token 检查，未登录跳转 /login）
├── +layout.svelte                          # 根布局（全局 CSS + Toast 挂载）
├── +error.svelte                           # 错误页面
├── login/+page.svelte                      # 登录页（密码可见性切换，Open Redirect 防护）
├── register/+page.svelte                   # 注册页（密码可见性切换，Open Redirect 防护）
├── (app)/
│   ├── +layout.svelte                      # 应用布局（模型加载、DB初始化、IndexedDB→MySQL迁移、Ollama版本检查，合并第三方模型）
│   ├── +page.svelte                        # 新对话页（首页）
│   ├── c/[id]/+page.svelte                # 对话详情页（重命名、删除）
│   └── profile/+page.svelte               # 个人资料页（头像/用户名/邮箱/密码修改、退出确认）
├── advice_table/+page.svelte               # 建议与反馈提交页
├── .well-known/[...path]/+server.ts        # Chrome DevTools 探测请求静默处理（返回 204）
└── api/
    ├── auth/+server.ts                     # POST 登录/注册（bcryptjs + JWT）
    ├── user/profile/+server.ts             # PUT 用户资料（用户名改时同步chats+签发新token）
    ├── chats/+server.ts                    # GET(分页)/POST(创建/更新)/DELETE(全部) 聊天
    ├── chats/[id]/+server.ts              # GET/PUT/DELETE 单条聊天
    ├── advice_table/+server.ts             # POST 提交建议
    ├── feedback_table/+server.ts           # POST 提交反馈
    └── fetch-url/+server.ts               # POST 抓取网页文本（10s超时，SSRF 私有IP防护，提取8000字符）
```

所有 8 个 API 路由均受 `requireAuth()` 保护，从 JWT Bearer token 提取用户身份。

## 认证体系 (`src/lib/server/auth.ts`)

- `hashPassword(p)` / `verifyPassword(p, hash)` — bcryptjs（纯 JS，盐轮 10），2026-05 从 `bcrypt` 迁移以消除原生编译依赖和 `url.parse()` 弃用警告
- `signToken({userId, username})` / `verifyToken(token)` — 自定义 HMAC-SHA256 JWT（基于 `js-sha256`），7 天有效期
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

**timestamp 迁移**：2026-05 从 `BIGINT` 毫秒时间戳迁移为 `DATETIME`。`db.ts` 中 `UPDATE FROM_UNIXTIME` 自动转换已有数据。

**IndexedDB→MySQL 迁移**：`+layout.svelte` 中 `migrateFromIndexedDB()`，完成后设 localStorage 标记不重复执行。

**密码迁移脚本**：`scripts/migrate-passwords.ts` 用于将旧 bcrypt 哈希迁移为 bcryptjs 格式。

**API 提供商配置**：第三方 API 提供商（名称/URL/Key/模型列表）存储在 `localStorage.apiProviders`，设置面板「API」标签管理。

## 状态管理 (`src/lib/stores/index.ts`)

| Store | 类型 | 用途 |
|-------|------|------|
| `info` | `{}` | Ollama 服务信息（版本号） |
| `db` | `undefined \| object` | MySQL API 包装实例，提供 getChats/createNewChat/updateChatById/deleteChatById/deleteAllChat/exportChats/addChats 等方法 |
| `chatId` | `string` | 当前对话 UUID |
| `chats` | `[]` | `{id, title, timestamp}` 列表，侧边栏数据源 |
| `models` | `[]` | 合并后的所有可用模型（Ollama 本地 + 第三方 API），ModelSelector 数据源 |
| `user` | `{id, username, email, avatar?, system_avatar?} \| null` | 当前登录用户 |
| `settings` | `Settings` | 应用设置（`API_BASE_URL`、`theme`、`fontSize`、`proactiveGreeting`、`privacyMode`等），持久化到 localStorage |
| `showSettings` | `boolean` | 设置弹窗开关 |
| `moodHistory` | `{date, mood, score}[]` | 情绪追踪数据 |

## 共享模块

| 文件 | 内容 |
|------|------|
| `src/lib/chat/ollama.ts` | `sendPromptOllama`（流式 Ollama）、`sendPrompt`（多模型并行，自动路由 Ollama/OpenAI）、`submitPrompt`（URL抓取+联网搜索+文件提取）、`generateChatTitle`、`stopResponse`、`regenerateResponse`、`copyToClipboard`。流式完成后批量保存。所有 history 变更后调用 `c().notifyUpdate()` 触发 Svelte 响应式更新。 |
| `src/lib/chat/openai.ts` | `sendPromptOpenAI`（OpenAI 兼容流式）、`findProvider`、`getThirdPartyModels`、`getProviders`、`fetchModels`。处理 OpenAI/DeepSeek/通义千问等兼容 API。 |
| `src/lib/server/auth.ts` | bcryptjs 哈希、JWT 签发/验证、`requireAuth` 中间件 |
| `src/lib/server/db.ts` | MySQL 连接池 + 4 张表 DDL + 列迁移（avatar/system_avatar/timestamp DATETIME） |
| `src/lib/client/http.ts` | `authFetch`（自动附加 JWT Bearer token，401 时清除登录态并跳转）、`getToken`、`getCurrentUser` |
| `src/lib/utils/index.ts` | `splitStream`（SSE 流式解析 TransformStream）、`convertMessagesToHistory`（消息数组→树形结构）、`datetimeNow()`（返回 `YYYY-MM-DD HH:MM:SS` 格式） |

## 响应式核心机制：notifyUpdate

由于聊天核心逻辑在 `ollama.ts` / `openai.ts` 外部模块中，对 `history` 对象的属性变更（mutation）发生在组件作用域之外，Svelte 编译器无法追踪这些变更来触发 `$:` 响应式语句。为解决此问题，引入了 `notifyUpdate` 回调：

1. 组件内定义 `let updateCounter = 0;` 和一个将其引用到 `$:` 语句的响应式块：`$: updateCounter, (() => { ... rebuild messages from history ... })();`
2. `getCtx()` 返回 `notifyUpdate: () => { updateCounter++; }` 闭包
3. `ollama.ts` / `openai.ts` 的 `ChatContext` 接口包含 `notifyUpdate: () => void`
4. 每次修改 `history`（用户消息、AI 响应、流式内容追加、完成/错误状态）后立即调用 `c().notifyUpdate()`
5. 对于需要最新数据的逻辑（如 `createNewChat` 检查 `messages.length`），直接使用 `c().messages` 而非开头解构的局部快照，因为 `notifyUpdate` 后组件 `messages` 已被响应式语句重建而局部变量仍为旧引用
6. **注意**：`autoScroll` 在流式循环中应使用 `currentCtx.autoScroll`（实时值），而非函数开头解构的捕获值

## 第三方 API 提供商架构

提供商配置存储于 `localStorage.apiProviders`，格式：
```json
[{"id":"xxx","name":"DeepSeek","baseUrl":"https://api.deepseek.com/v1","apiKey":"sk-...","models":[{"id":"deepseek-chat","name":"deepseek-chat"}]}]
```

- `+layout.svelte` 的 `getThirdPartyModels()` 将提供商模型转为 Ollama 模型格式（名称 `提供商名/模型ID`）
- `sendPrompt` 通过 `findProvider()` 检测模型所属提供商，自动路由到 `sendPromptOpenAI`
- 提供商变更后通过 `refreshAllModels()` 即时刷新模型列表

## 聊天消息数据模型

树形结构：每条消息 `{id, parentId, childrenIds[], role, content, images?, files?}`。`history = {messages: {messageId → message}, currentId}` 为全局映射。`messages` 响应式从 `currentId` 上溯到根构建线性数组。支持分支对话（`showPreviousMessage`/`showNextMessage` 已实现）。

## 核心组件

| 组件 | 位置 | 关键特性 |
|------|------|---------|
| **Messages.svelte** | chat/ | Markdown（`marked` + HTML 净化）、代码高亮（`highlight.js` 增量高亮，`data-highlighted` 追踪）、LaTeX（`KaTeX`）、复制+MD复制按钮（+ toast）、tippy.js tooltip（`data-tippy-added` 防重复）、分支导航函数、**用户气泡显示图片缩略图+附件文件名标签**、`break-words [&_p]:m-0` |
| **MessageInput.svelte** | chat/ | 固定底部、自动伸缩（max 200px）、粉色发送按钮、停止按钮、语音输入（Web Speech API）、**文件/图片上传**（粘贴/拖拽/选择，10MB限制）、Enter发送/Shift+Enter换行 |
| **ModelSelector.svelte** | chat/ | `<select>` 下拉、自动选中首个可用模型、"设为默认模型"持久化、**显示 Ollama + 第三方 API 合并模型列表** |
| **SettingsModal.svelte** | chat/ | **7 标签页**：常规（外观+连接）、偏好（6项开关）、人设（system prompt）、模型（拉取/列表/删除）、**API（第三方提供商管理）**、高级（seed/temperature/num_ctx等）、关于（版本号） |
| **Advanced.svelte** | chat/Settings/ | 高级模型参数表单（num_ctx 默认 8192，范围 512-131072） |
| **Sidebar.svelte** | layout/ | 260px、新对话按钮、搜索、按日期分组（可折叠，"更早"默认折叠）、删除按钮、底部建议/导出/设置+用户入口+退出、移动端遮罩层 |
| **Navbar.svelte** | layout/ | 对话标题（可重命名）、新对话按钮、删除确认（修复双重goto） |
| **Modal.svelte** | common/ | 通用弹窗容器（点击背景关闭） |
| **Overlay.svelte** | common/ | 通用遮罩层（当前未被引用） |
| **Spinner.svelte** | common/ | 加载动画（当前未被引用） |

## 样式与主题

Tailwind CSS，`class` 策略暗色模式。主题初始化在 `app.html` 的 `<script>` 中同步执行以防止闪烁：
- 从 `localStorage.theme` 读取（`'dark'` / `'light'` / `'system'`），system 模式下跟随 `prefers-color-scheme`
- 字体大小通过 `--font-size-scale` CSS 变量控制（small: 0.875, normal: 1, large: 1.15）
- `localStorage.theme` 持久化，主色系：`pink-500`（操作按钮）、`pink-50/100/200`（浅色侧边栏/状态）、`pink-700/800/900`（深色侧边栏/状态）

## 多模型支持

`selectedModels` 数组支持同时选多个模型（Ollama 本地 + 第三方 API 混合），`sendPrompt` 使用 `Promise.all` 并行向各模型发送相同 prompt，各自产生独立回复分支。第三方模型自动走 OpenAI 兼容 API。

## 关键依赖

| 包 | 用途 |
|----|------|
| `bcryptjs` | 密码哈希（纯 JS，零原生依赖） |
| `mysql2/promise` | MySQL 连接池 + 参数化查询 |
| `js-sha256` | JWT 签名 HMAC-SHA256 |
| `marked` + `highlight.js` + `kaTeX` | Markdown 渲染 + 代码高亮 + 数学公式 |
| `svelte-french-toast` | Toast 通知（v1.x，无 `toast.info`，用 `toast()` 替代） |
| `tippy.js` | 消息 info tooltip（token/s 等流式指标） |
| `uuid` | 消息 ID / 会话 ID 生成 |
| `idb` | IndexedDB 操作（仅用于旧数据迁移） |
| `cross-env` | Windows/macOS/Linux 跨平台环境变量 |
| `file-saver` | 对话 JSON 导出下载 |

## 安全加固

- **Open Redirect**：login/register 的 `redirect` 参数仅允许站内相对路径
- **SSRF**：`/api/fetch-url` 阻止内网/私有 IP 地址
- **XSS**：Messages.svelte 中 `sanitizeHtml()` 移除 `<script>` 和 `on*` 事件属性
- **CSP Ready**：所有 API 调用使用参数化查询，LIMIT/OFFSET 经 `parseInt` 防护

## 当前已安装模型

| 模型 | 大小 | 系列 | 参数量 | 量化 |
|------|------|------|--------|------|
| `qwen3:0.6b` | 0.5GB | qwen3 | 752M | Q4_K_M |
| `qwen_data2_3000:latest` | 3.7GB | qwen | 1.8B | F16 |
| `qwen_data2_3000_q4:latest` | 1.1GB | qwen | 1.8B | Q4_0 |
| `qwen_3100_q4:latest` | 1.1GB | qwen | 1.8B | Q4_0 |

## 相关文档

- [系统后期优化改进（第一轮）](./系统后期优化改进.md) — 基于 Open WebUI/Lobe Chat/ChatGPT/Claude/Gemini 对标分析
- [系统后期优化改进2（第二轮）](./系统后期优化改进2.md) — 基于 Kimi/豆包/通义千问/文心一言等行业产品对标分析
- [系统后期优化改进3（第三轮）](./系统后期优化改进3.md) — 基于前两轮 + 最新代码审查，聚焦情感陪伴核心能力
