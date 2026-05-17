import type { MailSender } from './types.js';
import { StubMailSender } from './stub.js';
import { SmtpMailSender } from './smtp.js';

export type { MailSender, MailMessage } from './types.js';
export { buildMagicLinkMail } from './templates.js';

let instance: MailSender | null = null;

/**
 * 模块单例。第一次调用时按 MAIL_TRANSPORT 选择实现。
 *   - 'smtp'        → SmtpMailSender（依赖 SMTP_* 环境变量）
 *   - 'stub' / unset → StubMailSender（console.log，不真发）
 */
export function getMailSender(): MailSender {
  if (instance) return instance;

  const kind = (process.env.MAIL_TRANSPORT || 'stub').toLowerCase();

  if (kind === 'smtp') {
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
