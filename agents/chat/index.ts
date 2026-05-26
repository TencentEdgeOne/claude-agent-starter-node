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

import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { resolveModelName, collectGatewayEnv } from '../_model';
import { createLogger } from '../_logger';

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


function buildAgentOptions(opts?: { claudeSessionStore?: any; mcpServer?: any; mcpServerName?: string; allowedTools?: string[]; env?: Record<string, string | undefined> }) {
  const ctxEnv = opts?.env ?? {};
  const options: Record<string, any> = {
    model: resolveModelName(ctxEnv),
    systemPrompt: SYSTEM_PROMPT,
    cwd: process.cwd(),
    tools: [],
    allowedTools: [...(opts?.allowedTools ?? [])],
    settingSources: ["user", "project"],
    skills: "all",
    permissionMode: 'bypassPermissions',
    maxTurns: 10,
    env: {
      ...ctxEnv,
      ...collectGatewayEnv(ctxEnv),
    },
  };
  if (opts?.claudeSessionStore) {
    options.sessionStore = opts.claudeSessionStore;
  }
  if (opts?.mcpServer && opts?.mcpServerName) {
    options.mcpServers = { [opts.mcpServerName]: opts.mcpServer };
  }
  return options;
}

function sseFrame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Extract short name from MCP tool full name (e.g. mcp__edgeone__commands → commands) */
function extractToolName(rawName: string): string {
  if (rawName.includes('__')) {
    return rawName.split('__').pop() || rawName;
  }
  return rawName;
}

function safeJsonPreview(value: unknown, maxLength = 800): string {
  try {
    const text = JSON.stringify(value);
    if (!text) return String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...<truncated>` : text;
  } catch {
    return String(value);
  }
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

  if (typeof context.tools?.toClaudeMcpServer !== 'function') {
    throw new Error('context.tools.toClaudeMcpServer is unavailable. Please upgrade the EdgeOne Pages agent runtime.');
  }

  const edgeoneMcp = context.tools.toClaudeMcpServer();

  const mcpServer = createSdkMcpServer({
    name: edgeoneMcp.name,
    tools: edgeoneMcp.tools,
    alwaysLoad: true,
  });

  const { allowedTools } = edgeoneMcp;
  logger.log('[tools] registered EdgeOne MCP tools:', allowedTools);

  const options = buildAgentOptions({ claudeSessionStore, mcpServer, mcpServerName: edgeoneMcp.name, allowedTools, env: context.env });
  const encoder = new TextEncoder();
  let stopped = false;
  let fullAssistantText = '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Emit skills config event before query starts
        controller.enqueue(encoder.encode(sseFrame('skills_loaded', {
          skills: options.skills,
          settingSources: options.settingSources,
        })));

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
        let lastMsgType = '';

        for await (const msg of q) {
          if (signal?.aborted) { stopped = true; break; }

          // New assistant message round detected: if previous was user (tool_result), reset counters
          if (msg.type === 'assistant' && lastMsgType === 'user') {
            sentTextLenByBlock.clear();
          }
          lastMsgType = msg.type;

          // Intercept base64Image from tool_result and push as image event to frontend
          if (msg.type === 'user') {
            try {
              const toolResults = (msg as any).tool_use_result ?? (msg as any).message?.content ?? [];
              const resultArr = Array.isArray(toolResults) ? toolResults : [toolResults];
              for (const item of resultArr) {
                // tool_use_result format: [{type: "text", text: "{\"base64Image\": \"...\"}"}]
                const text = typeof item === 'string' ? item : (item?.text ?? item?.content ?? '');
                if (typeof text === 'string' && text.includes('base64Image')) {
                  try {
                    const parsed = JSON.parse(text);
                    if (parsed?.base64Image) {
                      logger.log('[image] extracted base64Image from tool_result, size:', parsed.base64Image.length);
                      controller.enqueue(encoder.encode(sseFrame('image', { base64: parsed.base64Image })));
                    }
                  } catch { /* not valid JSON, skip */ }
                }
              }
            } catch (e) {
              logger.error('[image] failed to extract base64Image:', e);
            }
          }

          // Debug: push all message types for frontend observability
          if (msg.type !== 'assistant' && msg.type !== 'result') {
            controller.enqueue(encoder.encode(sseFrame('debug_msg', {
              msgType: msg.type,
              preview: safeJsonPreview(msg, 4000),
            })));
          }

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
                const rawToolName = block.name || '';
                const toolName = extractToolName(rawToolName);
                const toolId = 'id' in block ? block.id : undefined;
                const toolInput = 'input' in block ? block.input : undefined;

                logger.log(
                  '[tools] call requested',
                  {
                    cid: conversationId,
                    blockIndex: idx,
                    tool: toolName,
                    rawTool: rawToolName,
                    toolId,
                    inputKeys: toolInput && typeof toolInput === 'object' ? Object.keys(toolInput) : [],
                    inputPreview: safeJsonPreview(toolInput),
                  },
                );

                controller.enqueue(encoder.encode(sseFrame('tool_called', { tool: toolName })));
              } else {
                // Other block types (e.g. image): push as debug_block event to frontend as-is
                controller.enqueue(encoder.encode(sseFrame('debug_block', {
                  blockIndex: idx,
                  blockType: block.type,
                  block: safeJsonPreview(block, 4000),
                })));
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
