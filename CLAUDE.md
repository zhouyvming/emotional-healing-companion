# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev       # 启动开发服务器，运行在 http://localhost:8080
npm run build     # Vite 生产构建
npm run fmt       # 用 Prettier 格式化 Svelte + JS/CSS/MD/HTML/JSON 文件
```

本项目没有测试套件。

## 项目概述

SvelteKit 1.x + Svelte 4 应用，SPA 模式（`ssr: false`）。Ollama 本地大模型聊天界面，品牌名"情感疗愈伴侣"——粉色主题的中文情感支持聊天机器人。

## 路由结构

```
src/routes/
├── +layout.js                              # 路由守卫（JWT token 检查，未登录跳转 /login）
├── +layout.svelte                          # 根布局（全局 CSS + Toast 挂载）
├── +error.svelte                           # 错误页面
├── login/+page.svelte                      # 登录页（密码可见性切换）
├── register/+page.svelte                   # 注册页（密码可见性切换）
├── (app)/
│   ├── +layout.svelte                      # 应用布局（模型加载、DB初始化、IndexedDB→MySQL迁移、Ollama版本检查）
│   ├── +page.svelte                        # 新对话页（首页）
│   ├── c/[id]/+page.svelte                # 对话详情页（重命名、删除）
│   └── profile/+page.svelte               # 个人资料页（头像/用户名/邮箱/密码修改、退出确认）
├── advice_table/+page.svelte               # 建议与反馈提交页
└── api/
    ├── auth/+server.ts                     # POST 登录/注册（bcrypt + JWT）
    ├── user/profile/+server.ts             # PUT 用户资料（用户名改时同步chats+签发新token）
    ├── chats/+server.ts                    # GET(分页)/POST(创建/更新)/DELETE(全部) 聊天
    ├── chats/[id]/+server.ts              # GET/PUT/DELETE 单条聊天
    ├── advice_table/+server.ts             # POST 提交建议
    └── feedback_table/+server.ts           # POST 提交反馈
```

所有 6 个 API 路由均受 `requireAuth()` 保护，从 JWT Bearer token 提取用户身份。

## 认证体系 (`src/lib/server/auth.ts`)

- `hashPassword(p)` / `verifyPassword(p, hash)` — bcrypt（盐轮 10）
- `signToken({userId, username})` / `verifyToken(token)` — 自定义 HMAC-SHA256 JWT，7 天有效期
- `requireAuth(request)` — 从 Authorization header 提取 Bearer token 并验证，失败抛出 `AuthError`
- Secret 默认硬编码，可通过 `JWT_SECRET` 环境变量覆盖

## 数据存储

**MySQL**（主存储，`mysql2/promise`）：连接池 `src/lib/server/db.ts`，`webui_chat` / `localhost:3307`。

表（自动初始化 + 追加列迁移）：
| 表 | 关键列 |
|----|--------|
| `users` | `id`, `username`(UNIQUE), `password`(VARCHAR bcrypt), `email`, `avatar`(LONGTEXT base64), `system_avatar`(LONGTEXT base64) |
| `chats` | `id`(UUID PK), `username`, `title`, `models`(JSON), `options`(JSON), `messages`(JSON), `history`(JSON), `system`(TEXT), `timestamp` |
| `feedback_table` | `id`, `username`, `content`, `created_at` |
| `advice_table` | `id`, `username`, `content`, `created_at` |

**IndexedDB→MySQL 迁移**：`+layout.svelte` 中 `migrateFromIndexedDB()`，完成后设 localStorage 标记不重复执行。

## 状态管理 (`src/lib/stores/index.ts`)

| Store | 类型 | 用途 |
|-------|------|------|
| `info` | `{}` | Ollama 服务信息（版本号） |
| `db` | `undefined \| object` | MySQL API 包装实例，提供 getChats/createNewChat/updateChatById/deleteChatById/deleteAllChat/exportChats/addChats 等方法 |
| `chatId` | `string` | 当前对话 UUID |
| `chats` | `[]` | `{id, title, timestamp}` 列表，侧边栏数据源 |
| `models` | `[]` | 可用 Ollama 模型列表 |
| `user` | `{id, username, email, avatar?, system_avatar?} \| null` | 当前登录用户 |
| `settings` | `{}` | 应用设置，持久化到 localStorage |
| `showSettings` | `boolean` | 设置弹窗开关 |

## 共享模块

| 文件 | 内容 |
|------|------|
| `src/lib/chat/ollama.ts` | `sendPromptOllama`（流式）、`sendPrompt`（多模型并行）、`submitPrompt`、`generateChatTitle`、`stopResponse`、`regenerateResponse`、`copyToClipboard`。流式完成后批量保存（非逐token写DB）。 |
| `src/lib/server/auth.ts` | bcrypt 哈希、JWT 签发/验证、`requireAuth` 中间件 |
| `src/lib/server/db.ts` | MySQL 连接池 + 4 张表 DDL + 列迁移 |
| `src/lib/client/http.ts` | `authFetch`（自动附加 JWT Bearer token，401 时清除登录态并跳转）、`getToken`、`getCurrentUser` |
| `src/lib/utils/index.ts` | `splitStream`（SSE 流式解析 TransformStream）、`convertMessagesToHistory`（消息数组→树形结构） |

## Ollama 集成

直接从浏览器调用 `http://localhost:11434/api`（可在设置中修改）。API 调用：

- `GET /api/tags` — 获取模型列表
- `POST /api/chat` — 流式聊天补全（SSE，每行 JSON，`splitStream("\n")` 解析）
- `POST /api/generate` — 非流式，自动生成对话标题（首轮 `messages.length==2` 时触发）
- `POST /api/pull` — 拉取模型（设置→模型管理，流式进度）
- `DELETE /api/delete` — 删除模型（设置→模型管理）
- `GET /api/version` — 检查 Ollama 版本

## 聊天消息数据模型

树形结构：每条消息 `{id, parentId, childrenIds[], role, content}`。`history = {messages: {messageId → message}, currentId}` 为全局映射。`messages` 响应式从 `currentId` 上溯到根构建线性数组。支持分支对话（`showPreviousMessage`/`showNextMessage` 已实现，← → UI 按钮待连接）。

## 核心组件

| 组件 | 关键特性 |
|------|---------|
| **Messages.svelte** | Markdown（`marked` + HTML 净化）、代码高亮（`highlight.js` 增量高亮）、LaTeX（`KaTeX`）、复制按钮（+ toast）、tippy.js tooltip、分支导航函数（UI待连接） |
| **MessageInput.svelte** | 固定底部、自动伸缩（max 200px）、粉色发送按钮、停止按钮、`focus-within:border-pink-400`、Enter发送/Shift+Enter换行 |
| **ModelSelector.svelte** | `<select>` 下拉、自动选中首个可用模型、"设为默认模型"持久化 |
| **SettingsModal.svelte** | 4 标签页，600px×70vh响应式：常规（主题/系统头像/偏好/API地址）、模型（拉取/列表/删除）、高级（seed/temperature/top_k等）、关于（版本号） |
| **Sidebar.svelte** | 260px、新对话按钮、搜索、按日期分组（可折叠，"更早"默认折叠）、删除按钮（桌面hover/移动端常显）、底部5按钮+用户入口+退出、移动端遮罩层 |
| **Navbar.svelte** | 对话标题（可重命名）、新对话按钮、删除确认 |
| **Modal.svelte** | 通用弹窗容器（点击背景关闭） |
| **Advanced.svelte** | 高级模型参数表单（SettingsModal 子组件） |
| **Overlay.svelte** | 通用遮罩层（当前未被引用） |
| **Spinner.svelte** | 加载动画（当前未被引用） |

## 样式

Tailwind CSS，`class` 策略暗色模式。`localStorage.theme` 持久化，`app.html` 防闪烁脚本。主色系：`pink-500`（操作按钮）、`pink-50/100/200`（浅色侧边栏/状态）、`pink-700/800/900`（深色侧边栏/状态）。

## 多模型支持

`selectedModels` 数组支持同时选多个模型，`sendPrompt` 使用 `Promise.all` 并行向各模型发送相同 prompt，各自产生独立回复分支。

## 当前已安装模型

| 模型 | 大小 | 系列 | 参数量 | 量化 |
|------|------|------|--------|------|
| `qwen3:0.6b` | 0.5GB | qwen3 | 752M | Q4_K_M |
| `qwen_data2_3000:latest` | 3.7GB | qwen | 1.8B | F16 |
| `qwen_data2_3000_q4:latest` | 1.1GB | qwen | 1.8B | Q4_0 |
| `qwen_3100_q4:latest` | 1.1GB | qwen | 1.8B | Q4_0 |

## 相关文档

- [系统后期优化改进（第一轮）](./系统后期优化改进.md)
- [系统后期优化改进2（第二轮）](./系统后期优化改进2.md)
