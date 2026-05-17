/**
 * 邮件投递抽象。
 *
 * Sprint 1 提供 stub（console）+ smtp（nodemailer）两个实现，按 MAIL_TRANSPORT
 * 环境变量切换。SMTP adapter 一份代码同时支持 QQ / 163 / Outlook / 腾讯云
 * SES SMTP 网关 / 阿里云 DirectMail SMTP，只切换 host + 凭证。
 *
 * 后续如果要走云厂商 HTTP API（如腾讯云 SES SDK 模板邮件），新建一个 adapter
 * 实现本 interface 即可，调用方零改动。
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** 纯文本兜底（必有） */
  text: string;
  /** 可选 HTML 版本（更好的客户端会优先渲染） */
  html?: string;
}

export interface MailSender {
  /** 同步抛错 = 配置错；异步 reject = 投递失败 */
  send(msg: MailMessage): Promise<void>;
}
