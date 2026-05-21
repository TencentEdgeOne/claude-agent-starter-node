/**
 * History handler — EdgeOne Pages Functions
 * =========================================
 *
 * File path agents/history/index.ts maps to **POST /history**
 *
 * Reads conversation history from ctx.store.getMessages() and returns
 * it to the frontend for restoring the chat window after a page refresh.
 */

import { createLogger } from '../_logger';

const logger = createLogger('history');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

type FrontendMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;

  if (content !== null && typeof content === 'object' && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    if ('content' in obj) return contentToText(obj.content);
    if ('output' in obj) return contentToText(obj.output);
    if ('text' in obj) return String(obj.text ?? '');
    return '';
  }

  if (Array.isArray(content)) {
    return content
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object',
      )
      .map(item => String(item.text ?? item.output_text ?? ''))
      .filter(Boolean)
      .join('\n');
  }

  return String(content);
}

export async function onRequest(context: any) {
  const startTime = Date.now();
  logger.log(`[history] start: ${new Date(startTime).toISOString()}`);

  const conversationId: string = context.conversation_id ?? '';
  const store = context.store ?? null;

  logger.log('conversationId:', conversationId);

  if (!store || !conversationId) {
    logger.log(`[history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ conversation_id: conversationId, messages: [] });
  }

  try {
    const history = await store.getMessages({
      conversationId,
      limit: 100,
      order: 'asc',
    });

    const messages: FrontendMessage[] = [];
    for (const item of history) {
      const role = item.role;
      if (role !== 'user' && role !== 'assistant') continue;

      const content = contentToText(item.content);
      if (!content) continue;

      messages.push({
        id: item.messageId ?? `${role}-${item.createdAt ?? 0}`,
        role,
        content,
        timestamp: item.createdAt ?? 0,
      });
    }

    logger.log(`[history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ conversation_id: conversationId, messages });
  } catch (e) {
    logger.error('failed to get messages:', e);
    logger.log(`[history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ conversation_id: conversationId, messages: [] });
  }
}
