import { z } from 'zod';

/**
 * 上报事件白名单 — 严格 schema，超出字段后端拒收。
 * 注意：任何业务相关字段（金额/资产名/ticker/key）都不在 schema 里，自然就会被 zod 丢弃。
 */
export const eventSchema = z.object({
  event: z.enum(['page_view', 'cta_click', 'dwell']),
  ts: z.number().int().positive(),
  device: z.string().min(8).max(64),
  session: z.string().min(8).max(64),
  path: z.string().max(120).optional(),
  ref_host: z.string().max(120).optional(),
  cta: z.enum([
    'import_screenshot',
    'setup_key_start',
    'setup_key_done',
    'open_advisor',
    'open_goal_plan',
    'add_asset_manual',
    'add_goal',
    'refresh_quotes',
    'recompute_derived'
  ]).optional(),
  dwell_ms: z.number().int().min(0).max(30 * 60 * 1000).optional(),
  lang: z.string().max(8).optional(),
  sw: z.string().max(16).optional(),
  app_ver: z.string().max(32).optional()
}).strict();   // .strict() = 多余字段直接抛错

export type IngestEvent = z.infer<typeof eventSchema>;

export const rangeSchema = z.enum(['7d', '30d', '90d']).default('30d');

export function rangeToDays(r: '7d' | '30d' | '90d'): number {
  return r === '7d' ? 7 : r === '90d' ? 90 : 30;
}
