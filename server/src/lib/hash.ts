import { createHmac, randomBytes } from 'node:crypto';

const SALT = process.env.EMAIL_HASH_SALT;
if (!SALT) {
  console.error('[fatal] EMAIL_HASH_SALT is not set');
  process.exit(1);
}

/**
 * 邮箱单向哈希：HMAC-SHA256(SALT, lowercase(trim(email)))
 * 同一邮箱永远映射到同一 hash；DB 泄露后无法反查明文邮箱列表。
 */
export function hashEmail(email: string): string {
  return createHmac('sha256', SALT!)
    .update(email.trim().toLowerCase())
    .digest('hex');
}

/**
 * 任意 token 的单向哈希（magic link / future studio license refresh token）
 */
export function hashToken(raw: string): string {
  return createHmac('sha256', SALT!)
    .update(raw)
    .digest('hex');
}

/**
 * 生成 url-safe magic link 原 token（32 字节 base64url）
 * 原 token 通过邮件发给用户；DB 只存 hashToken(raw)
 */
export function generateMagicToken(): string {
  return randomBytes(32).toString('base64url');
}
