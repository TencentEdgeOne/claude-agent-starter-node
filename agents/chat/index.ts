/**
 * Agent handler — EdgeOne Pages Functions
 * ========================================
 *
 * File path agents/chat/index.ts maps to **POST /chat**
 *
 * context convention:
 *   context.request.body    — object, request body
 *   context.request.signal  — AbortSignal, set when /stop is called
 *   context.conversation_id — conversation ID
 *   context.store           — store adapter (appendMessage / getMessages)
 *   context.tools           — EdgeOne platform sandbox toolkit
 */

import { query, createSdkMcpServer, tool as defineClaudeTool } from '@anthropic-ai/claude-agent-sdk';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { resolveModelName, collectGatewayEnv } from '../_model';
import { createLogger } from '../_logger';

const MCP_SERVER_NAME = 'edgeone';
const logger = createLogger('chat');

const SYSTEM_PROMPT =
  'You are a helpful assistant running inside an EdgeOne sandbox environment.\n' +
  'You have access to these EdgeOne platform tools:\n' +
  '- commands: execute shell commands in the sandbox (e.g. date, ls, uname).\n' +
  '- files: file operations in the sandbox — read, write, list, makeDir, exists, remove.\n' +
  '  Parameters: op (required), path (required for most ops), content (for write).\n' +
  '- code_interpreter: run code in an isolated interpreter.\n' +
  '  Parameters: language (e.g. "python"), code (the source code to execute).\n' +
  '- browser: interact with web pages — fetch, screenshot, click, type, evaluate.\n' +
  '  Parameters: op (required), url (for fetch), selector, text, script.\n\n' +
  'Use tools whenever they help answer the user\'s question concretely.\n' +
  'Call tools ONE AT A TIME. Do NOT simulate or fake tool outputs — actually call the tool.\n' +
  'Do NOT use any tools other than those listed above.';


type PlatformTool = {
  name?: string;
  description?: string;
  function?: { name?: string; description?: string };
  execute?: (args: Record<string, any>) => unknown | Promise<unknown>;
  handler?: (args: Record<string, any>) => unknown | Promise<unknown>;
  invoke?: (args: Record<string, any>) => unknown | Promise<unknown>;
};

type ClaudeMcpTool = SdkMcpToolDefinition<any>;

const TOOL_INPUT_SCHEMAS = {
  commands: {
    cmd: z.string().describe('Shell command to execute'),
    cwd: z.string().describe('Working directory').optional(),
  },
  files: {
    op: z.enum(['read', 'write', 'list', 'exists', 'remove', 'makeDir']).describe('File operation'),
    path: z.string().describe('File or directory path'),
    content: z.string().describe('Content for write').optional(),
  },
  browser: {
    op: z.enum(['fetch', 'screenshot', 'click', 'type', 'evaluate']).describe('Browser operation'),
    url: z.string().describe('Target URL').optional(),
    selector: z.string().describe('CSS selector').optional(),
    text: z.string().describe('Text to type').optional(),
    script: z.string().describe('JavaScript to evaluate').optional(),
  },
  code_interpreter: {
    language: z.enum(['python', 'javascript', 'r', 'bash']).describe('Language to execute'),
    code: z.string().describe('Code to execute'),
  },
} satisfies Record<string, Record<string, z.ZodTypeAny>>;

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  const json = JSON.stringify(result, null, 2);
  return typeof json === 'string' ? json : String(result);
}

function buildEdgeOneMcpTools(context: any): { tools: ClaudeMcpTool[]; allowedTools: string[] } {
  const platformTools: PlatformTool[] = context.tools?.all?.() ?? [];
  const tools: ClaudeMcpTool[] = [];

  logger.log('[tools] platform tools count:', platformTools.length);

  for (const item of platformTools) {
    const name = item.name || item.function?.name;
    const execute = item.execute || item.handler || item.invoke;
    const inputSchema = name ? TOOL_INPUT_SCHEMAS[name as keyof typeof TOOL_INPUT_SCHEMAS] : undefined;

    if (!name || !inputSchema || typeof execute !== 'function') {
      logger.log('[tools] skipped unsupported platform tool:', name ?? '<unknown>');
      continue;
    }

    const mcpTool = defineClaudeTool(
      name,
      item.description || item.function?.description || `EdgeOne platform tool: ${name}`,
      inputSchema,
      async (args) => {
        try {
          const result = await execute.call(item, args as Record<string, any>);
          return { content: [{ type: 'text' as const, text: stringifyToolResult(result) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: 'text' as const, text: message }], isError: true };
        }
      },
    ) as ClaudeMcpTool;

    tools.push(mcpTool);
    logger.log(`[tools] registered platform tool: ${name}`);
  }

  return {
    tools,
    allowedTools: tools.map((item) => `mcp__${MCP_SERVER_NAME}__${item.name}`),
  };
}


function buildAgentOptions(opts?: { claudeSessionStore?: any; mcpServer?: any; allowedTools?: string[] }) {
  const options: Record<string, any> = {
    model: resolveModelName(),
    systemPrompt: SYSTEM_PROMPT,
    tools: [],
    allowedTools: opts?.allowedTools ?? [],
    settingSources: [],
    addDirs: [],
    permissionMode: 'bypassPermissions',
    maxTurns: 10,
    env: collectGatewayEnv(),
  };
  if (opts?.claudeSessionStore) {
    options.sessionStore = opts.claudeSessionStore;
  }
  if (opts?.mcpServer) {
    options.mcpServers = { [MCP_SERVER_NAME]: opts.mcpServer };
  }
  return options;
}

function sseFrame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 从 MCP 工具全名中提取短名（如 mcp__edgeone__commands → commands） */
function extractToolName(rawName: string): string {
  if (rawName.includes('__')) {
    return rawName.split('__').pop() || rawName;
  }
  return rawName;
}

export async function onRequest(context: any) {
  const body = context.request.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return new Response(
      JSON.stringify({ error: "'message' is required" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const signal: AbortSignal | undefined = context.request.signal;
  const conversationId: string = context.conversation_id ?? '';
  const store = context.store ?? null;

  logger.log(`[request] cid=${conversationId}, message="${message.slice(0, 50)}..."`);

  // Get Claude session store for transcript persistence
  const claudeSessionStore = store?.claude_session_store?.() ?? null;

  // Save user message to store
  if (store && conversationId) {
    try { await store.appendMessage({ conversationId, role: 'user', content: message }); }
    catch (e) { logger.error('[store] failed to save user message:', e); }
  }

  // 构建 EdgeOne 平台工具 → Claude Agent SDK MCP server
  const { tools: mcpTools, allowedTools } = buildEdgeOneMcpTools(context);
  const mcpServer = createSdkMcpServer({
    name: MCP_SERVER_NAME,
    tools: mcpTools,
    alwaysLoad: true,
  });

  const options = buildAgentOptions({ claudeSessionStore, mcpServer, allowedTools });
  const encoder = new TextEncoder();
  let stopped = false;
  let fullAssistantText = '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const abortController = new AbortController();
        if (signal?.aborted) {
          abortController.abort();
        } else {
          signal?.addEventListener('abort', () => abortController.abort(), { once: true });
        }

        const q = query({
          prompt: message,
          options: { ...options, abortController },
        });
        const sentTextLenByBlock = new Map<number, number>();

        for await (const msg of q) {
          if (signal?.aborted) { stopped = true; break; }

          if (msg.type === 'assistant') {
            const blocks = msg.message?.content ?? [];
            for (let idx = 0; idx < blocks.length; idx++) {
              const block = blocks[idx];

              if (block.type === 'text') {
                const fullText = block.text || '';

                const alreadySent = sentTextLenByBlock.get(idx) ?? 0;
                if (fullText.length > alreadySent) {
                  const delta = fullText.slice(alreadySent);
                  sentTextLenByBlock.set(idx, fullText.length);
                  fullAssistantText = fullText;
                  controller.enqueue(encoder.encode(sseFrame('text_delta', { delta })));
                }
              } else if (block.type === 'tool_use') {
                const toolName = extractToolName(block.name || '');
                logger.log(`[stream] tool_called: ${toolName}`);
                controller.enqueue(encoder.encode(sseFrame('tool_called', { tool: toolName })));
              }
            }
          } else if (msg.type === 'result') {
            break;
          }
        }
      } catch (e: unknown) {
        const error = e as Error;
        if (error.name === 'AbortError' || signal?.aborted) {
          stopped = true;
          logger.log('[stream] aborted by user');
        } else {
          logger.error('[stream] error:', error.message);
          controller.enqueue(
            encoder.encode(sseFrame('error', { message: String(error.message ?? e) })),
          );
        }
      } finally {
        // Save assistant response to store
        if (store && conversationId && fullAssistantText.trim()) {
          try { await store.appendMessage({ conversationId, role: 'assistant', content: fullAssistantText }); }
          catch (e) { logger.error('[store] failed to save assistant response:', e); }
        }

        controller.enqueue(encoder.encode(sseFrame('done', { stopped })));
        controller.close();
      }
    },
    cancel() {
      logger.log('[stream] client disconnected');
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
