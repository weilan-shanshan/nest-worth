import type { MailMessage, MailSender } from './types.js';

/**
 * Dev / 测试用：邮件不真发，打 console.log。
 * 生产环境绝不要用（链接包含 token，日志会泄漏）。
 */
export class StubMailSender implements MailSender {
  async send(msg: MailMessage): Promise<void> {
    console.log('[mail.stub]', '→', msg.to, '|', msg.subject);
    console.log('[mail.stub] body:\n' + msg.text);
  }
}
