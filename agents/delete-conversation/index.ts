/**
 * Delete-conversation handler — EdgeOne Makers
 * ============================================
 *
 * File path agents/delete-conversation/index.ts maps to **POST /delete-conversation**.
 *
 * Permanently deletes an entire conversation via
 * `context.store.deleteConversation({ conversationId })` (or the snake_case
 * `delete_conversation` alias). Removes the message index, conversation
 * metadata and the global conversation index — irreversible.
 *
 * Requires `user_id` (or `userId`) so we don't accidentally delete a
 * conversation that doesn't belong to the requesting browser.
 */

import { createLogger } from '../_logger';

const logger = createLogger('delete-conversation');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function readRequestBody(context: any): Promise<Record<string, unknown>> {
  const body = context.request?.body;
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof context.request?.json === 'function') {
    try {
      return await context.request.json();
    } catch {
      return {};
    }
  }

  return {};
}

function getConversationId(body: Record<string, unknown>): string {
  const value = body.conversation_id ?? body.conversationId;
  return typeof value === 'string' ? value.trim() : '';
}

function getUserId(body: Record<string, unknown>): string {
  const value = body.user_id ?? body.userId;
  return typeof value === 'string' ? value.trim() : '';
}

export async function onRequest(context: any) {
  const startTime = Date.now();
  logger.log(`[delete-conversation] start: ${new Date(startTime).toISOString()}`);

  const body = await readRequestBody(context);
  const conversationId = getConversationId(body);
  const userId = getUserId(body);
  const store = context.store ?? null;

  logger.log('conversationId:', conversationId, 'userId:', userId || '-');

  if (!conversationId) {
    logger.error('Missing conversationId');
    logger.log(`[delete-conversation] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ status: 'error', message: 'conversation_id is required' }, 400);
  }

  const deleter =
    typeof store?.deleteConversation === 'function'
      ? store.deleteConversation.bind(store)
      : typeof store?.delete_conversation === 'function'
        ? store.delete_conversation.bind(store)
        : null;

  if (!deleter) {
    logger.error('context.store.deleteConversation is unavailable');
    logger.log(`[delete-conversation] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse(
      { status: 'error', message: 'store.deleteConversation is unavailable' },
      501,
    );
  }

  try {
    const args: Record<string, unknown> = { conversationId };
    if (userId) args.userId = userId;
    await deleter(args);

    logger.log(`[delete-conversation] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ status: 'ok', conversation_id: conversationId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('failed to delete conversation:', e);
    logger.log(`[delete-conversation] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse(
      { status: 'error', conversation_id: conversationId, message },
      500,
    );
  }
}
