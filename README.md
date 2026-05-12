# 情感疗愈伴侣 (Emotional Healing Companion)

基于 Ollama 的本地大语言模型情感支持聊天机器人，使用本地 AI 模型提供温暖、私密的交流体验。

## 技术栈

| 层面 | 技术 |
|------|------|
| 前端框架 | SvelteKit 1.x + Svelte 4（SPA 模式，`ssr: false`） |
| UI | Tailwind CSS（粉色主题，深色/浅色模式切换） |
| 数据库 | MySQL 8（`mysql2/promise`），`localhost:3307` |
| AI 服务 | Ollama（本地大语言模型，`http://localhost:11434/api`） |
| 认证 | bcrypt 密码哈希 + 自定义 HMAC-SHA256 JWT（7天有效期） |
| Markdown | `marked` + 代码高亮（`highlight.js`）+ 数学公式（`KaTeX`） |

## 功能

**聊天**
- 流式响应（SSE 解析，完成后批量保存）
- 多模型并行对话（`Promise.all` 同时向多个模型提问）
- 树形消息结构，支持对话分支
- 自动生成对话标题（语言自适应）
- Markdown 渲染 + HTML 净化 + 代码语义高亮 + LaTeX
- 复制消息 / 重新生成 / 停止响应

**用户系统**
- 注册/登录（密码 bcrypt 加密，JWT 认证）
- 6 个 API 路由全部受认证中间件保护
- 个人资料管理（头像上传、用户名、邮箱、密码修改）
- 用户名变更时自动同步聊天记录 + 签发新 token
- 自定义系统头像（每个用户独立，AI 助手头像个性化）
- 退出登录（含确认步骤）

**模型管理**
- 查看已安装模型详情（大小、系列、参数量、量化级别）
- 拉取新模型（流式进度显示）
- 删除模型（含确认）

**其他**
- 对话导出（JSON 下载）
- 建议与反馈提交
- 侧边栏聊天列表按日期分组（今天/昨天/本周/更早），可搜索、折叠
- 响应式布局（移动端侧边栏自动隐藏 + 遮罩层）
- 深色/浅色主题切换

## 快速开始

### 环境要求

- Node.js >= 18
- MySQL 运行在 `localhost:3307`（root，无密码）
- Ollama 运行在 `http://localhost:11434`

### 数据库初始化

```sql
CREATE DATABASE IF NOT EXISTS webui_chat CHARACTER SET utf8mb4;
```

应用启动时自动创建 4 张表（`users`、`chats`、`feedback_table`、`advice_table`）并执行列迁移。

### 安装和启动

```bash
npm install
npm run dev     # 访问 http://localhost:8080
```

### 生产构建

```bash
npm run build
```

## 项目结构

```
src/
├── app.html / app.css                  # HTML 模板 + 全局样式
├── lib/
│   ├── chat/ollama.ts                  # 核心聊天逻辑（流式、多模型、标题生成、剪贴板）
│   ├── client/http.ts                  # 客户端 HTTP 工具（authFetch 自动附加 JWT）
│   ├── server/
│   │   ├── auth.ts                     # 服务端认证（bcrypt + JWT）
│   │   └── db.ts                       # MySQL 连接池 + 表初始化
│   ├── stores/index.ts                 # 8 个 Svelte writable stores
│   ├── components/
│   │   ├── chat/
│   │   │   ├── Messages.svelte         # 消息渲染（markdown/代码/LaTeX/复制/tooltip）
│   │   │   ├── MessageInput.svelte     # 输入框（自动伸缩、发送/停止）
│   │   │   ├── ModelSelector.svelte    # 模型选择器（自动选中首个模型）
│   │   │   ├── SettingsModal.svelte    # 设置弹窗（常规/模型/高级/关于）
│   │   │   └── Settings/Advanced.svelte
│   │   ├── layout/
│   │   │   ├── Sidebar.svelte          # 侧边栏（聊天列表/搜索/分组/导出/用户入口）
│   │   │   └── Navbar.svelte           # 顶部导航栏（标题/重命名/删除）
│   │   └── common/                     # Modal、Overlay、Spinner
│   └── utils/index.ts                  # splitStream、convertMessagesToHistory
├── routes/
│   ├── +layout.js                      # 路由守卫（JWT 检查）
│   ├── +layout.svelte                  # 根布局（全局 CSS + Toast）
│   ├── +error.svelte                   # 错误页面
│   ├── login/register/                 # 登录/注册页
│   ├── (app)/
│   │   ├── +layout.svelte              # 应用布局（模型/DB/迁移/版本检查）
│   │   ├── +page.svelte                # 新对话页
│   │   ├── c/[id]/+page.svelte        # 对话详情页
│   │   └── profile/+page.svelte        # 个人资料页
│   ├── advice_table/+page.svelte       # 建议反馈页
│   └── api/                            # 6 个认证 API 路由
└── static/                             # favicon、默认头像、manifest.json
```

## 当前已安装模型

| 模型 | 大小 | 系列 | 参数量 | 量化 |
|------|------|------|--------|------|
| `qwen3:0.6b` | 0.5GB | qwen3 | 752M | Q4_K_M |
| `qwen_data2_3000:latest` | 3.7GB | qwen | 1.8B | F16 |
| `qwen_data2_3000_q4:latest` | 1.1GB | qwen | 1.8B | Q4_0 |
| `qwen_3100_q4:latest` | 1.1GB | qwen | 1.8B | Q4_0 |

## 优化文档

- [系统后期优化改进（第一轮）](./系统后期优化改进.md) — 基于 Open WebUI/Lobe Chat/ChatGPT/Claude/Gemini 对标分析
- [系统后期优化改进2（第二轮）](./系统后期优化改进2.md) — 基于 Kimi/豆包/通义千问/文心一言等行业产品对标分析
