/**
 * Agent handler — EdgeOne Makers
 * ========================================
 *
 * File path agents/chat/index.ts maps to **POST /chat**
 *
 * context convention:
 *   context.request.body    — object, request body
 *   context.request.signal  — AbortSignal, set when /stop is called
 *   context.conversation_id — conversation ID
 *   context.store           — store adapter (appendMessage / getMessages / claudeSessionStore)
 *   context.tools           — EdgeOne platform sandbox toolkit
 */

import { createSdkMcpServer, getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { resolveModelName, collectGatewayEnv } from '../_model';
import { createLogger } from '../_logger';
import { createChatStream } from './_stream';

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
  'Do NOT use any tools other than those listed above.\n\n' +
  '## Skills\n\n' +
  'You have the following skill available:\n\n' +
  '### smart-translator\n' +
  'Translate text between Chinese and English while preserving tone, formatting, terminology, and Markdown structure.\n' +
  'Use this skill when the user asks to translate, localize, or polish bilingual content.\n\n' +
  'When translating:\n' +
  '1. Detect the source language automatically.\n' +
  '2. Translate Chinese to English, or English to Chinese, unless the user specifies another target.\n' +
  '3. Preserve Markdown, inline code, links, placeholders, and product names.\n' +
  '4. Keep technical terms accurate and consistent.\n' +
  '5. Use a clear, professional, and concise tone unless instructed otherwise.\n' +
  '6. Do not add unrelated explanation.\n' +
  '7. Return the translation directly. Only add a "Notes" section when there are important terminology or localization decisions.';

function normalizeUuid(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(trimmed)
    ? trimmed
    : null;
}

async function resolveClaudeSessionBinding(
  sessionStore: any,
  conversationId: string,
  cwd: string,
): Promise<{ sessionId?: string; resume?: string }> {
  const sessionId = normalizeUuid(conversationId);
  if (!sessionId) {
    logger.log(`[session] skip SDK session binding: invalid conversationId=${conversationId}`);
    return {};
  }

  try {
    const infoOptions = sessionStore?.load
      ? { dir: cwd, sessionStore }
      : { dir: cwd };
    const info = await getSessionInfo(sessionId, infoOptions);
    if (info) {
      logger.log(`[session] resume Claude SDK sessionId=${sessionId}`);
      return { resume: sessionId };
    }
    logger.log(`[session] create Claude SDK sessionId=${sessionId}`);
  } catch (e) {
    logger.error('[session] failed to inspect sessionStore for resume:', e);
  }

  return { sessionId };
}

function buildAgentOptions(opts?: {
  claudeSessionStore?: any;
  mcpServer?: any;
  mcpServerName?: string;
  allowedTools?: string[];
  env?: Record<string, string | undefined>;
  sessionId?: string;
  resume?: string;
}) {
  const ctxEnv = opts?.env ?? {};
  const cwd = process.cwd();
  const options: Record<string, any> = {
    model: resolveModelName(ctxEnv),
    systemPrompt: SYSTEM_PROMPT,
    cwd,
    tools: [],
    allowedTools: [...(opts?.allowedTools ?? [])],
    settingSources: ["project"],
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
  if (opts?.resume) {
    options.resume = opts.resume;
  } else if (opts?.sessionId) {
    options.sessionId = opts.sessionId;
  }
  if (opts?.mcpServer && opts?.mcpServerName) {
    options.mcpServers = { [opts.mcpServerName]: opts.mcpServer };
  }
  return options;
}

export async function onRequest(context: any) {
  const body = context.request.body ?? {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const userMsgId = typeof body.userMsgId === 'string' ? body.userMsgId : undefined;
  const botMsgId = typeof body.botMsgId === 'string' ? body.botMsgId : undefined;

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

  // EdgeOne store returns a Claude SDK-compatible SessionStore for transcript persistence.
  const claudeSessionStore = store?.claude_session_store?.() ?? null;

  // Save user message to store (with frontend-generated ID for history alignment)
  if (store && conversationId) {
    try { await store.appendMessage({ conversationId, role: 'user', content: message, messageId: userMsgId }); }
    catch (e) { logger.error('[store] failed to save user message:', e); }
  }

  if (typeof context.tools?.toClaudeMcpServer !== 'function') {
    throw new Error('context.tools.toClaudeMcpServer is unavailable. Please upgrade the EdgeOne Makers agent runtime.');
  }

  const edgeoneMcp = context.tools.toClaudeMcpServer();

  const mcpServer = createSdkMcpServer({
    name: edgeoneMcp.name,
    tools: edgeoneMcp.tools,
    alwaysLoad: true,
  });

  const { allowedTools } = edgeoneMcp;
  logger.log('[tools] registered EdgeOne MCP tools:', allowedTools);

  const sessionBinding = await resolveClaudeSessionBinding(claudeSessionStore, conversationId, process.cwd());
  const options = buildAgentOptions({
    claudeSessionStore,
    mcpServer,
    mcpServerName: edgeoneMcp.name,
    allowedTools,
    env: context.env,
    ...sessionBinding,
  });
  const stream = createChatStream({
    message,
    options,
    signal,
    logger,
    conversationId,
    store,
    botMsgId,
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
