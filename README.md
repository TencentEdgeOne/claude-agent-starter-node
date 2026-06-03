# Claude Agent Starter

A full-stack EdgeOne Makers Agent template powered by Anthropic Claude Agent SDK.

## Deploy

[![Deploy with EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=claude-agent-starter-node&from=within&fromAgent=1&agentLang=typescript)

## Features

- **SSE Streaming Chat** — Token-by-token `text_delta` push; `tool_called` events when tools are invoked
- **Session Persistence** — Saves Claude transcript via `context.agent.store.claude_session_store()` for cross-request context restore
- **EdgeOne Sandbox Tools** — commands, files, code_interpreter, browser — bridged to Claude Agent SDK via MCP Server
- **Tool Indicators** — 4 animated tool lamps light up in real time when Claude calls a tool
- **Observability** — EdgeOne runtime automatically injects tracing

## Directory Structure

```
claude-agent-starter/
├── src/                    # React + Vite + TypeScript frontend
│   ├── App.tsx             # Main app (conversation_id management)
│   ├── api.ts              # /chat, /stop, /history, /conversations, ... wrappers
│   └── components/         # ChatWindow, ChatInput, CodeViewer, ToolIndicators, etc.
├── agents/                 # Stateful EdgeOne Makers Agent Functions
│   ├── chat/index.ts       # POST /chat — SSE streaming chat
│   ├── stop/index.ts       # POST /stop — abort active agent run
│   ├── _model.ts           # Model & environment variable config
│   └── _logger.ts          # Logger utility
├── cloud-functions/        # Stateless EdgeOne Pages Node Functions (read/write the conversation store)
│   ├── history/index.ts            # POST /history — load conversation messages
│   ├── conversations/index.ts      # POST /conversations — list a user's conversations
│   ├── clear-history/index.ts      # POST /clear-history — clear messages of one conversation
│   ├── delete-conversation/index.ts# POST /delete-conversation — delete a conversation entirely
│   ├── _logger.ts          # Logger utility
│   └── _redact.ts          # Sensitive-field redactor for logs
├── package.json            # Dependencies (includes Claude Agent SDK)
├── edgeone.json            # EdgeOne deployment config
├── .env.example            # Environment variables template
├── vite.config.ts          # Vite config
├── tsconfig.json           # TypeScript config
└── index.html              # Entry HTML
```

> Files prefixed with `_` are private modules — not mapped as public routes by EdgeOne.
>
> **Why two backend folders?** `agents/` holds long-running, stateful routes (active SSE streams, per-conversation abort signals); `cloud-functions/` holds short, stateless routes that just read/write `context.agent.store`. Splitting them keeps history/list/delete requests from contending with an active chat for the per-conversation lock.

## Quick Start

### 1. Configure Environment Variables

The project currently uses `AI_GATEWAY_*` variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | AI Gateway API key |
| `AI_GATEWAY_BASE_URL` | Yes | AI Gateway base URL (must be Anthropic Messages API compatible) |
| `AI_GATEWAY_MODEL` | No | Model name (default: `@makers/hy3-preview`) |

### 2. Install Dependencies

```bash
npm install
```

### 3. Local Development

```bash
edgeone makers dev
```

### 4. Build

```bash
edgeone makers build
```

## API Endpoints

| Endpoint | Method | Side | Description |
|----------|--------|------|-------------|
| `/chat` | POST | `agents/` | SSE streaming chat. Header: `makers-conversation-id` |
| `/stop` | POST | `agents/` | Abort the active agent run. Body: `{ "conversation_id": "..." }` |
| `/history` | POST | `cloud-functions/` | Get conversation history. Header: `makers-conversation-id` |
| `/conversations` | POST | `cloud-functions/` | List a user's conversations (paginated). Body: `{ "user_id": "...", "limit"?: 20, "after"?: "...", "before"?: "...", "order"?: "desc" }` |
| `/clear-history` | POST | `cloud-functions/` | Clear all messages of one conversation. Body: `{ "conversation_id": "..." }` |
| `/delete-conversation` | POST | `cloud-functions/` | Permanently delete a conversation. Body: `{ "conversation_id": "..." }` |

### SSE Events

```
event: text_delta     data: {"delta":"Hello"}
event: tool_called    data: {"tool":"commands"}
event: image          data: {"base64":"..."}
event: ping           data: {"ts":1710000000000}
event: error          data: {"message":"..."}
event: done           data: {"stopped":false}
```

## Architecture

### Backend (`agents/` + `cloud-functions/`)

`agents/` is where the stateful work happens — it owns the live SSE stream and the AbortSignal for the running model call:

1. **`context.tools.toClaudeMcpServer()`** — Converts EdgeOne sandbox tools into a Claude MCP Server
2. **`createSdkMcpServer()`** — Registers the MCP server with the Claude Agent SDK
3. **`context.agent.store.claude_session_store()`** — Provides session persistence for multi-turn memory
4. **`query({ prompt, options })`** — Launches the Claude Agent with streaming output
5. **`store.appendMessage()`** — Saves user/assistant messages so they can be restored later

`cloud-functions/` handles the stateless conversation-store CRUD (history / conversations / clear-history / delete-conversation). They read/write `context.agent.store` directly without spinning up an agent run, so they don't compete with active chats for the per-conversation lock.

### Frontend (`src/`)

- `App.tsx` — Orchestrates chat panel + code viewer, manages SSE stream
- `api.ts` — SSE parsing, dispatches `onTextDelta`, `onToolCalled`, `onDone`, `onError`
- `components/CodeViewer.tsx` — Static display-only code panel (amber CRT aesthetic) showing the agent flow
- `components/ToolIndicators.tsx` — Animated tool lamps that flash when the model calls a tool

### Key Implementation Details

- **Dual Cancellation**: Frontend `AbortController.abort()` stops SSE read; backend `context.request.signal` propagates to the SDK and truly releases the upstream LLM connection
- **Tool Bridge**: EdgeOne sandbox tools (commands/files/code_interpreter/browser) are exposed to Claude via the MCP protocol
- **Image Support**: Base64 images from tool results (e.g. browser screenshots) are pushed as `image` SSE events
