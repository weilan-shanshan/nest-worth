import type { MailSender } from './types.js';
import { StubMailSender } from './stub.js';
import { SmtpMailSender } from './smtp.js';
import { TencentSesMailSender } from './tencent-ses.js';

export type { MailSender, MailMessage } from './types.js';
export { buildMagicLinkMail } from './templates.js';

let instance: MailSender | null = null;

/**
 * 模块单例。第一次调用时按 MAIL_TRANSPORT 选择实现。
 *   - 'tencent_ses' → TencentSesMailSender（HTTP API，个人实名账号也可用）
 *   - 'smtp'        → SmtpMailSender（依赖 SMTP_* 环境变量，需企业认证）
 *   - 'stub' / unset → StubMailSender（console.log，不真发）
 */
export function getMailSender(): MailSender {
  if (instance) return instance;

  const kind = (process.env.MAIL_TRANSPORT || 'stub').toLowerCase();

  if (kind === 'tencent_ses') {
    const secretId = process.env.TENCENT_SES_SECRET_ID;
    const secretKey = process.env.TENCENT_SES_SECRET_KEY;
    const region = process.env.TENCENT_SES_REGION || 'ap-hongkong';
    const from = process.env.TENCENT_SES_FROM;
    if (!secretId || !secretKey || !from) {
      console.error('[mail] MAIL_TRANSPORT=tencent_ses 但 TENCENT_SES_SECRET_ID / TENCENT_SES_SECRET_KEY / TENCENT_SES_FROM 不完整，降级到 stub');
      instance = new StubMailSender();
      return instance;
    }
    const templateIdRaw = process.env.TENCENT_SES_TEMPLATE_ID;
    const templateId = templateIdRaw ? Number(templateIdRaw) : undefined;
    if (templateIdRaw && (!Number.isInteger(templateId) || templateId! <= 0)) {
      console.error(`[mail] TENCENT_SES_TEMPLATE_ID 不是正整数: "${templateIdRaw}"，降级到 stub`);
      instance = new StubMailSender();
      return instance;
    }
    instance = new TencentSesMailSender({ secretId, secretKey, region, fromEmailAddress: from, templateId });
    const mode = templateId !== undefined ? `Template(${templateId})` : 'Simple';
    console.log(`[mail] Tencent SES enabled · region=${region} from=${from} mode=${mode}`);
  } else if (kind === 'smtp') {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '465');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM;
    if (!host || !user || !pass || !from) {
      console.error('[mail] MAIL_TRANSPORT=smtp 但 SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM 不完整，降级到 stub');
      instance = new StubMailSender();
      return instance;
    }
    instance = new SmtpMailSender({ host, port, secure: port === 465, user, pass, from });
    console.log(`[mail] SMTP enabled · host=${host} port=${port} from=${from}`);
  } else {
    instance = new StubMailSender();
    console.log('[mail] stub mode (邮件打 log 不真发)');
  }
  return instance;
}
