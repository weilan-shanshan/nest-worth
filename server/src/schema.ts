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

// ===========================================================================
// 商业化 schemas（Sprint 0）
// ===========================================================================

export const requestLinkSchema = z.object({
  email: z.string().email().max(254)
}).strict();

export const verifyLinkSchema = z.object({
  token: z.string().min(32).max(128)
}).strict();

export const SUBSCRIPTION_TIERS = ['free', 'plus', 'pro', 'max', 'studio'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'cancelled', 'expired', 'past_due'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * admin 手动升档 / 改状态 schema。
 * 与商业化支付通道未接通的过渡期内，作者收款后用 admin token 触发该接口。
 *
 * 字段语义：
 *   - email：必填，目标用户邮箱（HMAC 哈希后查 users 表）
 *   - tier：目标档位（free/plus/pro/max/studio）
 *   - status：可选，默认 'active'
 *   - periodEnd：可选，订阅到期日。null = 清除；未传 = 保留现值；ISO 8601 datetime
 *   - trialEndsAt：可选，试用结束时间，规则同上
 *   - createIfMissing：可选，目标 email 不存在时是否自动创建用户；默认 false
 */
/**
 * 用户提交升档意向（前端 Pricing 升级 modal 触发）。
 * 不真触发升档——只是让作者知道有人想付费 / 已付款，作者人工对账后再用
 * /admin/grant-tier 真正升档。
 *
 * billing 不强约束（用户可能填错或 lie），作者收到后看实际打款金额决定。
 */
export const upgradeRequestSchema = z.object({
  targetTier: z.enum(['plus', 'pro', 'max', 'studio']),
  billing: z.enum(['month', 'year', 'lifetime']),
  paymentMethod: z.enum(['wechat', 'alipay', 'other']),
  /** 可选备注：付款截图链接、特殊需求等 */
  note: z.string().max(500).optional()
}).strict();

export const grantTierSchema = z.object({
  email: z.string().email().max(254),
  tier: z.enum(SUBSCRIPTION_TIERS),
  status: z.enum(SUBSCRIPTION_STATUSES).default('active'),
  periodEnd: z.union([z.string().datetime(), z.null()]).optional(),
  trialEndsAt: z.union([z.string().datetime(), z.null()]).optional(),
  createIfMissing: z.boolean().default(false)
}).strict();
