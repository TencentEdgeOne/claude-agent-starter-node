# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

A full-stack Codex Agent starter template running on EdgeOne Makers. The frontend is a React chat UI that communicates with backend "agents" (EdgeOne Makers) via SSE streaming. The backend uses the Codex Agent SDK to invoke Codex with MCP tools in a sandboxed environment.

## Development Commands

```bash
# Install dependencies
npm install

# Local dev (recommended — starts both frontend + backend via EdgeOne Makers)
npm run dev:agents

# Frontend-only Vite dev server (port 5173)
npm run dev

# Type-check + production build
npm run build
```

Python agents (if using `agents-python/`):
```bash
pip install -r requirements.txt
```

**Prerequisite**: Codex CLI must be installed globally:
```bash
npm install -g @anthropic-ai/Codex
```

## Architecture

### Frontend (`src/`)

React 18 + TypeScript + Vite. CSS Modules for styling (`.module.css` files colocated with components).

- **`App.tsx`** — Main orchestrator. Manages conversation ID (persisted in localStorage), SSE stream lifecycle, tool lamp state, and abort/stop logic.
- **`api.ts`** — All HTTP calls (`/chat`, `/stop`, `/history`). SSE parsing with `dispatchSseChunk`. Returns `AbortController` for client-side cancellation.
- **`types.ts`** — Shared `Message` and `ToolLampState` interfaces.
- **`components/`** — `ChatWindow`, `ChatBubble`, `ChatInput`, `ToolIndicators`/`ToolLamp`, `CodeViewer` (static decorative code display).

### Backend (`agents/`)

EdgeOne Makers (Node.js/TypeScript). File path maps directly to route:

| File | Route | Purpose |
|------|-------|---------|
| `agents/chat/index.ts` | POST /chat | SSE streaming chat via `query()` from Codex Agent SDK |
| `agents/stop/index.ts` | POST /stop | Abort active agent run for a conversation |
| `agents/history/index.ts` | POST /history | Retrieve stored conversation messages |
| `agents/_model.ts` | (private) | Model name resolution + gateway env mapping |
| `agents/_logger.ts` | (private) | Shared logger factory |

Files prefixed with `_` are private modules (not exposed as routes).

### Key Conventions

- **Conversation ID**: Passed via `makers-conversation-id` HTTP header for `/chat` and `/history`. For `/stop`, the target conversation ID is in the request body (never in headers — this is critical to avoid signal collision).
- **SSE Protocol**: Events are `text_delta`, `tool_called`, `ping`, `error`, `done`. Each frame: `event: <type>\ndata: <json>\n\n`.
- **Session persistence**: `context.store.claude_session_store()` provides transcript persistence for cross-request context. `store.appendMessage()` / `store.getMessages()` handle user-facing history.
- **Cancellation**: Dual mechanism — frontend `AbortController.abort()` stops SSE reading; backend `context.utils.abortActiveRun()` interrupts the LLM.
- **MCP Tools**: EdgeOne platform tools (`commands`, `files`, `code_interpreter`, `browser`) are exposed via `context.tools.toClaudeMcpServer()` and registered with `createSdkMcpServer()`.

### Environment Configuration

Copy `.env.example` to `.env`. Two provider modes:
- `anthropic_official` — Direct Anthropic API (set `ANTHROPIC_API_KEY`)
- `ai_gate` — AI Gateway compatible with Anthropic Messages API

Current debug config in `_model.ts` maps `AI_GATEWAY_*` env vars to `ANTHROPIC_*` for the SDK subprocess.

### Deployment

Configured via `edgeone.json`. Build output goes to `dist/`. Agent timeout is 900s. Framework is `Codex-sdk`.
