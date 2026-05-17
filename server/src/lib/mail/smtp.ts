import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailSender } from './types.js';

export interface SmtpConfig {
  host: string;
  port: number;
  /** 465 → true；587 → false（用 STARTTLS） */
  secure: boolean;
  user: string;
  pass: string;
  /** From 头，格式 "Nestworth <noreply@example.com>" */
  from: string;
}

/**
 * SMTP adapter（基于 nodemailer）。
 *
 * 一份代码适配所有支持 SMTP 的提供商：
 *   - 腾讯云 SES：host=smtp.qcloudmail.com  port=465 secure=true
 *   - 阿里云 DirectMail：host=smtpdm.aliyun.com port=465 secure=true
 *   - QQ 邮箱：host=smtp.qq.com         port=465 secure=true
 *   - 163 邮箱：host=smtp.163.com       port=465 secure=true
 *   - Outlook：host=smtp.office365.com  port=587 secure=false
 *
 * 不在构造函数里 verify()，避免启动时阻塞；首次 send 失败时再抛具体错误。
 */
export class SmtpMailSender implements MailSender {
  private transporter: Transporter;
  private from: string;

  constructor(cfg: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass }
    });
    this.from = cfg.from;
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html
    });
  }
}
