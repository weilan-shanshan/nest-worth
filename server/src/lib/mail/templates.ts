import type { MailMessage } from './types.js';

const BRAND = 'Nestworth · 净值';

/**
 * 登录链接邮件。
 * 设计原则：
 *   - 纯文本和 HTML 都给（部分邮件客户端只渲染纯文本）
 *   - 链接显眼但不花哨；不放图片（避免被反垃圾打分）
 *   - 不提"账号""注册"等强 CTA 词（容易触发反垃圾）
 *   - 不带任何资产/金额/Key 字段
 */
export function buildMagicLinkMail(opts: { to: string; link: string; ttlMin: number }): MailMessage {
  const subject = `${BRAND} 登录链接`;
  const text = [
    `你好，`,
    ``,
    `点击下方链接完成登录：`,
    opts.link,
    ``,
    `链接 ${opts.ttlMin} 分钟内有效，一次性使用。`,
    ``,
    `如果不是你本人请求的登录，忽略即可。`,
    ``,
    `—— ${BRAND}`
  ].join('\n');

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:520px;margin:0 auto;padding:32px 24px;">
  <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;">${BRAND}</h2>
  <p style="margin:0 0 20px;color:#444;">点击下方按钮完成登录：</p>
  <p style="margin:0 0 24px;">
    <a href="${opts.link}" style="display:inline-block;background:#2e9e60;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">登录 Nestworth</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#666;">如果按钮无法点击，请复制以下链接到浏览器打开：</p>
  <p style="margin:0 0 24px;font-size:12px;color:#888;word-break:break-all;">${opts.link}</p>
  <p style="margin:0 0 4px;font-size:12px;color:#888;">链接 ${opts.ttlMin} 分钟内有效，一次性使用。</p>
  <p style="margin:0;font-size:12px;color:#888;">如果不是你本人请求的登录，忽略即可。</p>
</body></html>`;

  return { to: opts.to, subject, text, html };
}
