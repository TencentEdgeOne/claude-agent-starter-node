# 首页右侧 CodeViewer 展示代码草案

这份代码用于首页右侧 `CodeViewer` 展示，目标是**简洁表达 EdgeOne 上创建 Agent 的关键流程**，不要求直接运行。重点展示：

- `context.tools.toClaudeMcpServer()`：EdgeOne 沙箱工具一键转为 Claude MCP Server；
- `context.store`：保存用户/助手消息，支持历史恢复；
- `store.claude_session_store()`：注入 Claude Agent SDK 会话记忆；
- `query()`：启动 Claude Agent。

```ts
import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

const SYSTEM_PROMPT = `...`;

export async function onRequest(context: any) {
  const message = context.request.body?.message ?? '';
  const conversationId = context.conversation_id;
  const store = context.store;

  // 1. EdgeOne Store：保存用户消息，供历史恢复
  await store?.appendMessage?.({
    conversationId,
    role: 'user',
    content: message,
  });

  // 2. EdgeOne Store：注入 Claude Agent SDK 会话记忆
  const sessionStore = store?.claude_session_store?.();

  // 3. EdgeOne Tools：一键转换为 Claude MCP Server
  const edgeoneMcp = context.tools.toClaudeMcpServer();
  const mcpServer = createSdkMcpServer({
    name: edgeoneMcp.name,
    tools: edgeoneMcp.tools,
    alwaysLoad: true,
  });

  // 4. 创建 Agent 运行参数
  const options = {
    model: context.env.AI_GATEWAY_MODEL ?? '@Pages/hy3-preview',
    systemPrompt: SYSTEM_PROMPT,
    sessionStore,
    mcpServers: { [edgeoneMcp.name]: mcpServer },
    allowedTools: edgeoneMcp.allowedTools,
    permissionMode: 'bypassPermissions',
    maxTurns: 10,
    env: {
      ...context.env,
      ANTHROPIC_BASE_URL: context.env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY: context.env.AI_GATEWAY_API_KEY,
      ANTHROPIC_SMALL_FAST_MODEL: context.env.AI_GATEWAY_SMALL_MODEL,
    },
  };

  // 5. 启动 Claude Agent
  const result = query({ prompt: message, options });

  // 这里省略 SSE、text_delta、tool_called 等流式细节
  const assistantText = await collectAssistantText(result);

  // 6. EdgeOne Store：保存助手回复，供 /history 恢复
  await store?.appendMessage?.({
    conversationId,
    role: 'assistant',
    content: assistantText,
  });

  return Response.json({ answer: assistantText });
}

async function collectAssistantText(result: AsyncIterable<any>) {
  // 伪代码：消费 Claude Agent SDK 输出并拼接 assistant 文本
  return '...';
}
```

## 建议在 CodeViewer 中突出展示的流程

1. `context.store`：读写用户/助手消息；
2. `store.claude_session_store()`：为 Claude Agent SDK 注入会话记忆；
3. `context.tools.toClaudeMcpServer()`：把 EdgeOne 沙箱工具一键转为 Claude MCP Server；
4. `createSdkMcpServer()`：注册 EdgeOne MCP Server；
5. `allowedTools: edgeoneMcp.allowedTools`：只允许调用 EdgeOne 工具；
6. `query({ prompt, options })`：启动 Claude Agent；
7. `store.appendMessage()`：保存助手回复，支持历史恢复。
