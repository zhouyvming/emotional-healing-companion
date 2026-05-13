# 情感疗愈伴侣 (Emotional Healing Companion)

基于 Ollama 的本地大语言模型情感支持聊天机器人，使用本地 AI 模型提供温暖、私密的交流体验。

## 技术栈

| 层面 | 技术 |
|------|------|
| 前端框架 | SvelteKit 1.x + Svelte 4（SPA 模式，`ssr: false`） |
| UI | Tailwind CSS（粉色主题，深色/浅色模式切换） |
| 数据库 | MySQL 8（`mysql2/promise`），`localhost:3307` |
| AI 服务 | Ollama（本地大语言模型，`http://localhost:11434/api`） |
| 认证 | bcryptjs 密码哈希 + 自定义 HMAC-SHA256 JWT（7天有效期） |
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

## 新机子上手全流程

以下从零开始，逐项配置依赖、数据库、AI 服务和应用。

### 1. 安装 Node.js

需要 **Node.js >= 18**。

前往 https://nodejs.org 下载 LTS 版本（Windows 选 `.msi`，macOS 选 `.pkg`）。安装完成后验证：

```bash
node -v   # 应显示 v18 或更高
npm -v
```

### 2. 安装并配置 MySQL

端口固定为 **3307**，root 用户无密码（项目已硬编码这些值，可在设置面板修改）。

**Windows**
从 https://dev.mysql.com/downloads/installer/ 下载 MySQL Installer，安装时选择 MySQL Server 8.x，端口设为 `3307`，root 密码留空。

**macOS**
```bash
brew install mysql@8.0
brew services start mysql@8.0
# 如果端口不是 3307，编辑 my.cnf 把 port 改为 3307
```

**Linux (Debian/Ubuntu)**
```bash
sudo apt install mysql-server-8.0
sudo systemctl start mysql
# 修改端口：编辑 /etc/mysql/mysql.conf.d/mysqld.cnf，port = 3307，重启
```

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

Ollama 默认监听 `http://localhost:11434`，确保服务在运行：
```bash
curl http://localhost:11434/api/tags
```

### 4. 克隆并启动项目

```bash
git clone https://github.com/zhouyvming/emotional-healing-companion.git
cd emotional-healing-companion
npm install
npm run dev
```

浏览器打开 **http://localhost:8080**，注册账号即可开始使用。

### 5. 修改默认端口/密码（可选）

如果 MySQL 或 Ollama 端口与默认值不同，启动后在 **设置** → **常规** 中修改 API 地址。数据库连接可编辑 `src/lib/server/db.ts` 中的 `pool` 配置。

### 生产构建

```bash
npm run build
```

构建产物在 `build/` 目录，可用 `node build` 启动。

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
- [系统后期优化改进3（第三轮）](./系统后期优化改进3.md) — 基于前两轮 + 最新代码审查，聚焦情感陪伴核心能力
