/**
 * Clear history handler — EdgeOne Makers
 * ======================================
 *
 * File path agents/clear-history/index.ts maps to **POST /clear-history**.
 *
 * Clears all backend messages for the current conversation via
 * context.store.clearMessages({ conversationId }).
 */

import { createLogger } from '../_logger';
import { redactBase64Deep } from '../_redact';

const logger = createLogger('clear-history');

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
  return typeof value === 'string' ? value : '';
}

export async function onRequest(context: any) {
  const startTime = Date.now();
  logger.log(`[clear-history] start: ${new Date(startTime).toISOString()}`);

  const body = await readRequestBody(context);
  const conversationId = getConversationId(body);
  const store = context.store ?? null;

  logger.log('conversationId:', conversationId);

  if (!conversationId) {
    logger.error('Missing conversationId');
    logger.log(`[clear-history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ status: 'error', message: 'conversation_id is required' }, 400);
  }

  if (!store || typeof store.clearMessages !== 'function') {
    logger.error('context.store.clearMessages is unavailable');
    logger.log(`[clear-history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ status: 'error', message: 'store.clearMessages is unavailable' }, 501);
  }

  try {
    await store.clearMessages({ conversationId });

    if (typeof store.getMessages === 'function') {
      const historyAfterClear = await store.getMessages({
        conversationId,
        limit: 100,
        order: 'asc',
      });
      logger.log('[clear-history] history after clear:', {
        conversationId,
        count: Array.isArray(historyAfterClear) ? historyAfterClear.length : 0,
        messages: redactBase64Deep(historyAfterClear),
      });
    }

    logger.log(`[clear-history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ status: 'ok', conversation_id: conversationId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('failed to clear messages:', e);
    logger.log(`[clear-history] end: ${new Date().toISOString()}, total: ${Date.now() - startTime}ms`);
    return jsonResponse({ status: 'error', conversation_id: conversationId, message }, 500);
  }
}
