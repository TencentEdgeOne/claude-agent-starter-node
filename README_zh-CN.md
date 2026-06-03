# Claude Agent Starter

基于 Anthropic Agent SDK 运行在 EdgeOne Makers 上的全栈项目模板。

## 部署

[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?template=claude-agent-starter-node&from=within&fromAgent=1&agentLang=typescript)

## 功能

- **SSE 流式聊天** — 逐 token 推送 `text_delta`，命中工具时推送 `tool_called`
- **会话持久化** — 通过 `context.agent.store.claude_session_store()` 保存 Claude transcript，支持跨请求上下文恢复
- **EdgeOne 沙箱工具** — commands、files、code_interpreter、browser，通过 MCP Server 桥接至 Claude Agent SDK
- **工具灯状态** — 4 个动画工具灯，Claude 调用工具时实时点亮
- **可观测性** — EdgeOne 运行时自动注入追踪

## 目录结构

```
claude-agent-starter/
├── src/                    # React + Vite + TypeScript 前端
│   ├── App.tsx             # 主应用（conversation_id 管理）
│   ├── api.ts              # /chat、/stop、/history、/conversations 等请求封装
│   └── components/         # ChatWindow, ChatInput, CodeViewer, ToolIndicators 等
├── agents/                 # 有状态的 EdgeOne Makers Agent Functions
│   ├── chat/index.ts       # POST /chat — SSE 流式聊天
│   ├── stop/index.ts       # POST /stop — 中断正在执行的 agent
│   ├── _model.ts           # 模型与环境变量配置
│   └── _logger.ts          # 日志工具
├── cloud-functions/        # 无状态的 EdgeOne Pages Node Functions（读写会话存储）
│   ├── history/index.ts            # POST /history — 拉取对话消息
│   ├── conversations/index.ts      # POST /conversations — 列出某用户的会话
│   ├── clear-history/index.ts      # POST /clear-history — 清空某会话的消息
│   ├── delete-conversation/index.ts# POST /delete-conversation — 彻底删除某会话
│   ├── _logger.ts          # 日志工具
│   └── _redact.ts          # 日志敏感字段脱敏
├── package.json            # 项目依赖（含 Claude Agent SDK）
├── edgeone.json            # EdgeOne 部署配置
├── .env.example            # 环境变量模板
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
└── index.html              # 入口 HTML
```

> 以 `_` 开头的文件是私有模块，不会被 EdgeOne 映射为公开路由。
>
> **为什么后端拆成两个目录？** `agents/` 跑的是有状态、长连接的路由（活跃 SSE 流、按会话维度的 abort 信号）；`cloud-functions/` 跑的是只读写 `context.agent.store` 的短小无状态路由。两者拆开之后，历史记录 / 列表 / 删除等操作就不会和正在进行的对话争抢同一会话的锁。

## 快速开始

### 1. 配置环境变量

当前项目使用 `AI_GATEWAY_*` 变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | 是 | AI 网关 API Key |
| `AI_GATEWAY_BASE_URL` | 是 | AI 网关 Base URL（需兼容 Anthropic Messages API） |
| `AI_GATEWAY_MODEL` | 否 | 模型名称（默认 `@makers/hy3-preview`） |

### 2. 安装依赖

```bash
npm install
```

### 3. 本地开发

```bash
edgeone makers dev
```

### 4. 构建

```bash
edgeone makers build
```

## API 接口

| 端点 | 方法 | 所在目录 | 说明 |
|------|------|----------|------|
| `/chat` | POST | `agents/` | SSE 流式聊天，Header 带 `makers-conversation-id` |
| `/stop` | POST | `agents/` | 中断正在执行的 agent，Body 传 `{ "conversation_id": "..." }` |
| `/history` | POST | `cloud-functions/` | 获取对话历史，Header 带 `makers-conversation-id` |
| `/conversations` | POST | `cloud-functions/` | 列出某用户的会话（分页）。Body 传 `{ "user_id": "...", "limit"?: 20, "after"?: "...", "before"?: "...", "order"?: "desc" }` |
| `/clear-history` | POST | `cloud-functions/` | 清空某会话的全部消息，Body 传 `{ "conversation_id": "..." }` |
| `/delete-conversation` | POST | `cloud-functions/` | 彻底删除一个会话，Body 传 `{ "conversation_id": "..." }` |

### SSE 事件

```
event: text_delta     data: {"delta":"你好"}
event: tool_called    data: {"tool":"commands"}
event: image          data: {"base64":"..."}
event: ping           data: {"ts":1710000000000}
event: error          data: {"message":"..."}
event: done           data: {"stopped":false}
```

## 架构

### 后端（`agents/` + `cloud-functions/`)

`agents/` 是有状态的部分，持有正在进行的 SSE 流以及对应的 AbortSignal：

1. **`context.tools.toClaudeMcpServer()`** — 将 EdgeOne 沙箱工具一键转换为 Claude MCP Server
2. **`createSdkMcpServer()`** — 向 Claude Agent SDK 注册 MCP Server
3. **`context.agent.store.claude_session_store()`** — 提供 session 持久化，用于多轮对话记忆
4. **`query({ prompt, options })`** — 启动 Claude Agent 并流式输出
5. **`store.appendMessage()`** — 保存用户 / 助手消息，方便后续恢复

`cloud-functions/` 负责无状态的会话存储 CRUD（history / conversations / clear-history / delete-conversation）。这些路由直接读写 `context.agent.store`，不会启动 agent，也就不会和正在进行的对话抢同一个会话锁。

### 前端（`src/`）

- `App.tsx` — 编排聊天面板 + 代码查看器，管理 SSE 流
- `api.ts` — SSE 解析，分发 `onTextDelta`、`onToolCalled`、`onDone`、`onError`
- `components/CodeViewer.tsx` — 静态展示代码面板（琥珀 CRT 风格），展示 Agent 创建流程
- `components/ToolIndicators.tsx` — 模型调用工具时的动画指示灯

### 关键实现细节

- **双重取消机制**：前端 `AbortController.abort()` 停止 SSE 读取；后端 `context.request.signal` 传播到 SDK 并真正释放上游 LLM 连接
- **工具桥接**：EdgeOne 沙箱工具（commands/files/code_interpreter/browser）通过 MCP 协议暴露给 Claude
- **图片支持**：工具返回的 base64 图片（如浏览器截图）作为 `image` SSE 事件推送
