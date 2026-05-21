/*
 * 原通用配置逻辑先保留注释，当前调试版本固定走 AI Gateway。
 *
 * export const CLAUDE_MODEL = 'claude-sonnet-4-6';
 *
 * export function collectGatewayEnv(env: Record<string, string | undefined>): Record<string, string> {
 *   const provider = env.ACTIVE_PROVIDER || 'anthropic_official';
 *   let baseUrl: string;
 *   let resolvedApiKey: string;
 *
 *   if (provider === 'ai_gate') {
 *     baseUrl = env.AI_GATE_BASE_URL || '';
 *     resolvedApiKey = env.AI_GATE_API_KEY || '';
 *   } else {
 *     baseUrl = env.ANTHROPIC_BASE_URL || '';
 *     resolvedApiKey = env.ANTHROPIC_API_KEY || '';
 *   }
 *
 *   const result: Record<string, string> = {};
 *   if (baseUrl) result.ANTHROPIC_BASE_URL = baseUrl;
 *   if (resolvedApiKey) result.ANTHROPIC_API_KEY = resolvedApiKey;
 *   if (env.ANTHROPIC_CUSTOM_HEADERS) {
 *     result.ANTHROPIC_CUSTOM_HEADERS = env.ANTHROPIC_CUSTOM_HEADERS;
 *   }
 *
 *   let smallModel = env.AI_GATE_SMALL_MODEL || env.ANTHROPIC_SMALL_FAST_MODEL;
 *   if (provider === 'ai_gate' && !smallModel) {
 *     smallModel = 'anthropic/claude-haiku-4-5';
 *   }
 *   if (smallModel) {
 *     result.ANTHROPIC_SMALL_FAST_MODEL = smallModel;
 *   }
 *
 *   return result;
 * }
 *
 * export function resolveModelName(env: Record<string, string | undefined>): string {
 *   const provider = env.ACTIVE_PROVIDER || 'anthropic_official';
 *   if (provider === 'ai_gate') {
 *     return env.AI_GATE_MODEL || CLAUDE_MODEL;
 *   }
 *   return CLAUDE_MODEL;
 * }
 */

/**
 * AI Gateway 调试版配置。
 *
 * Claude Agent SDK 子进程仍读取 Anthropic 协议环境变量，
 * 所以这里把 AI_GATEWAY_* 映射成 ANTHROPIC_* 传给 SDK。
 *
 * 所有函数接收 context.env 作为参数，不再直接读取 process.env。
 */

const DEFAULT_MODEL = '@Pages/hy3-preview';

export function resolveModelName(env: Record<string, string | undefined>): string {
  return env.AI_GATEWAY_MODEL || DEFAULT_MODEL;
}

export function collectGatewayEnv(env: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  const model = env.AI_GATEWAY_MODEL || DEFAULT_MODEL;
  const baseUrl = env.AI_GATEWAY_BASE_URL;
  const apiKey = env.AI_GATEWAY_API_KEY;
  const smallModel = env.AI_GATEWAY_SMALL_MODEL || model;

  if (baseUrl) result.ANTHROPIC_BASE_URL = baseUrl;
  if (apiKey) result.ANTHROPIC_API_KEY = apiKey;
  if (smallModel) result.ANTHROPIC_SMALL_FAST_MODEL = smallModel;
  if (env.ANTHROPIC_CUSTOM_HEADERS) {
    result.ANTHROPIC_CUSTOM_HEADERS = env.ANTHROPIC_CUSTOM_HEADERS;
  }

  return result;
}
