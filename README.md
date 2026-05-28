# 情感疗愈伴侣 (Emotional Healing Companion)

基于 Ollama 的本地大语言模型情感支持聊天机器人，支持接入第三方 API 模型，提供温暖、私密的交流体验。

## 技术栈

| 层面     | 技术                                                       |
| -------- | ---------------------------------------------------------- |
| 前端框架 | SvelteKit 1.x + Svelte 4（SPA 模式，`ssr: false`）         |
| UI       | Tailwind CSS（粉色主题，深色/浅色模式切换）                |
| 数据库   | MySQL 8（`mysql2/promise`），`localhost:3307`              |
| AI 服务  | Ollama 本地模型 + OpenAI 兼容 API（DeepSeek / 通义千问等） |
| 认证     | bcryptjs 密码哈希 + 自定义 HMAC-SHA256 JWT（7 天有效期）   |
| 安全     | DOMPurify HTML 净化、注册速率限制、SSRF/Open Redirect 防护 |
| 知识库   | RAG 检索增强生成：Ollama Embedding + MySQL 向量存储 + 余弦相似度检索 |

## 功能

**聊天**

- 流式响应（SSE 解析，完成后批量保存）
- 支持 **Ollama 本地模型** + **OpenAI 兼容 API**（DeepSeek / 通义千问 / OpenAI 等）
- 多模型顺序对话（多个模型各自产生独立回复分支）
- 树形消息结构，支持对话分支
- 自动生成对话标题（语言自适应）
- 联网搜索增强：开启后发送前调用内置搜索接口，搜索结果只注入本次请求，不写入本地对话历史
- Markdown 渲染 + DOMPurify HTML 净化 + 代码高亮（highlight.js）+ 数学公式（KaTeX）
- AI 回复默认使用 Markdown 格式排版（标题、列表、加粗、代码块）
- 用户消息左对齐（头像在气泡左侧），头像 40px，气泡自适应内容宽度
- 时间戳/操作行通过隐形占位符与气泡左边缘自动对齐
- 上下文自动压缩（默认 200K tokens，超出自动截断早期消息）
- 复制消息 / Markdown 复制 / 重新生成 / 停止响应（AbortController）
- 消息编辑 + 删除（与日期同行显示）
- AI 回复朗读（Web Speech TTS，中文语音合成）
- 对话置顶：侧边栏图钉按钮，持久化置顶状态
- 键盘快捷键：Enter 发送 / Ctrl+Enter 发送 / Ctrl+N 新建对话 / Escape 关闭设置弹窗
- 情绪感知（AI 自动感知并回应用户情绪状态）
- 文件/图片上传（粘贴/拖拽/选择，10MB 限制，支持 txt/md/csv/doc/docx/pdf/xls/xlsx/pptx 文本解析后随本次请求发送）
- 移动端键盘适配（visualViewport API）

**用户系统**

- 注册/登录（bcryptjs 加密，密码最短 6 位，注册速率限制 5次/分钟）
- 全部 API 路由受 JWT 认证中间件保护
- 个人资料管理（头像上传、用户名、邮箱、密码修改）
- 用户名变更时自动同步聊天记录、API 提供商、情绪记录、建议反馈归属 + 签发新 token
- 自定义系统头像
- 退出登录（侧边栏直接退出 + 个人资料页确认退出）

**模型管理**

- 查看已安装 Ollama 模型详情（大小、系列、参数量、量化级别）
- 拉取新模型（流式进度显示）/ 删除模型（含确认）
- 第三方 API 提供商管理：添加/删除/获取模型列表
- 第三方 API 提供商配置跨浏览器同步（MySQL `api_providers` 表，保存使用事务）
- 设为默认模型：设置面板一键指定默认模型（第三方优先），新会话自动使用

**设置面板**

- 常规：主题（深色/浅色/跟随系统）+ 字体大小（三档）+ 系统头像 + API 地址
- 偏好：主动问候 / 隐私模式 / 自动标题 / 自动复制 / 联网搜索 / 情绪感知
- 人设：AI 名称 + 自定义 AI 身份性格（system prompt）
- 模型与 API：已安装模型详情 + 设为默认 + 第三方提供商管理（添加表单可折叠）
- 高级：上下文长度（默认 200K，最大 200K）+ 温度/种子/Top P 等参数
- 关于：版本信息

**其他**

- 对话导出：JSON + Markdown（已移至个人资料页"导出所有会话"）
- 建议与反馈提交
- 侧边栏聊天列表按日期分组（今天/昨天/本周/更早），可搜索、折叠
- 响应式布局（移动端侧边栏自动隐藏 + 遮罩层）
- 流式中断恢复提示（刷新后未完成消息标注）
- **知识库（RAG）**：上传文档到知识库 → Ollama 本地 Embedding → 对话时向量检索 Top-K 片段注入 Prompt

> **使用知识库功能必须安装 Ollama 并拉取嵌入模型，例如：**
> ```bash
> ollama pull nomic-embed-text       # 推荐，274MB，768维，中英文兼容
> ollama pull bge-m3                 # BGE-M3，1.2GB，1024维，多语言
> ollama pull multilingual-e5-large  # 多语言 E5，560MB，1024维
> ollama pull mxbai-embed-large      # 335MB，1024维，英文为主
> ```
> 创建知识库后可在数据库 `knowledge_bases.embedding_model` 字段指定使用的模型。

## 接入第三方 API 模型

1. 打开 **设置 → API** 标签页
2. 填写提供商信息：
   - 名称（如 DeepSeek）
   - API 地址（如 `https://api.deepseek.com/v1`）
   - API Key
3. 点击 **添加**，再点击 **获取模型** 拉取可用模型列表
4. 在聊天页模型选择器中即可选择第三方模型（显示为 `提供商名/模型ID`）

第三方模型发送本次请求输入 + 用户设定的 system prompt + Markdown 格式指令。若开启联网搜索，请求输入会附加搜索结果块但不写入历史；图片输入仅对可能支持视觉的模型使用 OpenAI vision content，其余模型降级为文本提示。

## 新机子上手全流程

### 1. 安装 Node.js

需要 **Node.js >= 18**。

前往 https://nodejs.org 下载 LTS 版本。安装完成后验证：

```bash
node -v
npm -v
```

### 2. 安装并配置 MySQL

端口固定为 **3307**（可通过 `MYSQL_PORT` 环境变量覆盖）。

**创建数据库**

```bash
mysql -u root -h 127.0.0.1 -P 3307
```

```sql
CREATE DATABASE IF NOT EXISTS webui_chat CHARACTER SET utf8mb4;
```

应用首次启动时会自动建表并执行列迁移，无需手动操作。

### 3. 安装并配置 Ollama

前往 https://ollama.com/download 下载安装。

启动后至少拉取一个模型：

```bash
ollama pull qwen3:0.6b
```

### 4. 克隆并启动项目

```bash
git clone https://github.com/zhouyvming/emotional-healing-companion.git
cd emotional-healing-companion
npm install
npm run dev
```

浏览器打开 **http://localhost:8080**，注册账号即可开始使用。

### 5. 环境变量配置（可选）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_HOST` | `localhost` | MySQL 主机 |
| `MYSQL_PORT` | `3307` | MySQL 端口 |
| `MYSQL_USER` | `root` | MySQL 用户名 |
| `MYSQL_PASSWORD` | (空) | MySQL 密码 |
| `MYSQL_DATABASE` | `webui_chat` | 数据库名 |
| `JWT_SECRET` | (内置默认值) | JWT 签名密钥 |

### 生产构建

```bash
npm run build
```

构建产物在 `build/` 目录，可用 `node build` 启动。

## 项目结构

```
src/
├── app.html / app.css / tailwind.css     # HTML 模板 + 全局样式
├── lib/
│   ├── chat/
│   │   ├── ollama.ts                     # 核心聊天逻辑（Ollama 流式、搜索注入、消息路由、文件处理、标题生成）
│   │   └── openai.ts                     # OpenAI 兼容 API（流式聊天、多模态降级、模型获取、标题生成）
│   ├── client/
│   │   ├── http.ts                       # 客户端 HTTP（authFetch 自动附加 JWT）
│   │   └── fileParser.ts                 # 文件上传解析协调（状态管理 + 发送前补齐）
│   │   ├── server/
│   │   │   ├── auth.ts                   # 服务端认证（bcryptjs + JWT）
│   │   │   ├── db.ts                     # MySQL 连接池 + 表初始化（9张表，环境变量配置）
│   │   │   └── knowledge-base.ts         # 知识库引擎（切片/Embedding/余弦相似度/检索）
│   │   ├── stores/index.ts              # 10 个 Svelte writable stores（类型完善）
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── Messages.svelte       # 消息渲染（DOMPurify/marked/highlight.js/KaTeX/TTS/编辑删除）
│   │   │   │   ├── MessageInput.svelte   # 输入框（语音/上传/移动端键盘适配 + KB选择器）
│   │   │   │   ├── ModelSelector.svelte  # 模型选择器
│   │   │   │   ├── KnowledgeBaseSelector.svelte   # 知识库下拉选择器
│   │   │   │   ├── KnowledgeBaseManager.svelte    # 知识库管理面板
│   │   │   │   ├── KnowledgeBaseDocuments.svelte  # 知识库文档管理
│   │   │   │   ├── SettingsModal.svelte  # 设置弹窗（8标签页含知识库）
│   │   │   │   └── Settings/Advanced.svelte  # 高级参数（num_ctx 默认 200K）
│   │   ├── layout/
│   │   │   ├── Sidebar.svelte            # 侧边栏（列表/搜索/分组/置顶/导出JSON+MD/退出）
│   │   │   └── Navbar.svelte             # 顶部导航栏（标题/重命名/删除）
│   │   └── common/Modal.svelte           # 通用弹窗
│   └── utils/index.ts                    # splitStream/convertMessagesToHistory/datetimeNow/isPrivateUrl/removeMessageBranch
├── routes/
│   ├── +layout.js                        # 路由守卫（JWT + 访客白名单）
│   ├── +layout.svelte                    # 根布局（全局 CSS + Toast）
│   ├── +error.svelte                     # 错误页面
│   ├── login/register/                   # 登录/注册（Open Redirect 防护）
│   ├── (app)/
│   │   ├── +layout.svelte                # 应用布局（Ctrl+N 快捷键）
│   │   ├── +page.svelte                  # 新对话页（流式恢复提示）
│   │   ├── chat/[id]/+page.svelte        # 对话详情页
│   │   └── profile/+page.svelte          # 个人资料页
│   ├── advice_table/+page.svelte         # 建议反馈页
│   ├── api/                              # 17 个认证 API 路由（含 providers + knowledge-bases）
│   └── .well-known/[...path]/            # Chrome DevTools 静默路由
└── static/                               # 默认头像、字体、manifest.json
```
