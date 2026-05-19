/*
 * 原通用配置逻辑先保留注释，当前调试版本固定走 AI Gateway。
 *
 * import 'dotenv/config';
 *
 * export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
 *
 * export function collectGatewayEnv(): Record<string, string> {
 *   const provider = process.env.ACTIVE_PROVIDER || 'anthropic_official';
 *   let baseUrl: string;
 *   let resolvedApiKey: string;
 *
 *   if (provider === 'ai_gate') {
 *     baseUrl = process.env.AI_GATE_BASE_URL || '';
 *     resolvedApiKey = process.env.AI_GATE_API_KEY || '';
 *   } else {
 *     baseUrl = process.env.ANTHROPIC_BASE_URL || '';
 *     resolvedApiKey = process.env.ANTHROPIC_API_KEY || '';
 *   }
 *
 *   const env: Record<string, string> = {};
 *   if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
 *   if (resolvedApiKey) env.ANTHROPIC_API_KEY = resolvedApiKey;
 *   if (process.env.ANTHROPIC_CUSTOM_HEADERS) {
 *     env.ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;
 *   }
 *
 *   let smallModel = process.env.AI_GATE_SMALL_MODEL || process.env.ANTHROPIC_SMALL_FAST_MODEL;
 *   if (provider === 'ai_gate' && !smallModel) {
 *     smallModel = 'anthropic/claude-haiku-4-5';
 *   }
 *   if (smallModel) {
 *     env.ANTHROPIC_SMALL_FAST_MODEL = smallModel;
 *   }
 *
 *   return env;
 * }
 *
 * export function resolveModelName(): string {
 *   const provider = process.env.ACTIVE_PROVIDER || 'anthropic_official';
 *   if (provider === 'ai_gate') {
 *     return process.env.AI_GATE_MODEL || CLAUDE_MODEL;
 *   }
 *   return CLAUDE_MODEL;
 * }
 */

/**
 * AI Gateway 调试版配置。
 *
 * Claude Agent SDK 子进程仍读取 Anthropic 协议环境变量，
 * 所以这里把 AI_GATEWAY_* 映射成 ANTHROPIC_* 传给 SDK。
 */
import 'dotenv/config';

export const CLAUDE_MODEL = '@Pages/hy3-preview';

export function collectGatewayEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const baseUrl = process.env.AI_GATEWAY_BASE_URL
  const apiKey = process.env.AI_GATEWAY_API_KEY
  const smallModel = process.env.AI_GATEWAY_SMALL_MODEL || CLAUDE_MODEL

  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (smallModel) env.ANTHROPIC_SMALL_FAST_MODEL = smallModel;
  if (process.env.ANTHROPIC_CUSTOM_HEADERS) {
    env.ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;
  }

  return env;
}

export function resolveModelName(): string {
  return CLAUDE_MODEL;
}
