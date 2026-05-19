import tencentcloud from 'tencentcloud-sdk-nodejs-ses';
import type { MailMessage, MailSender } from './types.js';

const SesClient = tencentcloud.ses.v20201002.Client;

export interface TencentSesConfig {
  secretId: string;
  secretKey: string;
  region: string;
  /**
   * 发信地址，格式两选一：
   *   纯地址："noreply@yourdomain.com"
   *   带显示名："Nestworth <noreply@yourdomain.com>"
   * SES 控制台已验证的发信地址才能用。
   */
  fromEmailAddress: string;
  /**
   * 控制台已审核通过的邮件模板 ID（整数）。
   * 个人实名账号必填——SES 拒绝 Simple 模式发信，只能引用预审核模板。
   * 模板里硬编码完整 URL 的域名 + path，{{token}} 和 {{ttl}} 作为变量。
   * 升企业认证后可留空，自动回退 Simple 模式。
   */
  templateId?: number;
}

/**
 * 腾讯云 SES HTTP API adapter（用于个人实名账号无法走 SMTP 的情况）。
 *
 * 双模式：
 *   - templateId 已配 + msg.templateData 已填 → Template 模式（个人实名唯一可走）
 *   - 否则 → Simple 模式（需企业认证；个人实名会被 SES 拒）
 *
 * 错误透传：SDK 抛 TencentCloudSDKError，调用方（auth route）已 catch 兜底。
 * 常见错：
 *   - InvalidParameter.FromAddressInvalid → 发信地址未验证或拼写错
 *   - LimitExceeded → 当日额度用完
 *   - AuthFailure → SecretId/SecretKey 错或子账号没权限
 *   - FailedOperation.TemplateOnly → 个人实名但没用 Template 模式
 */
export class TencentSesMailSender implements MailSender {
  private client: InstanceType<typeof SesClient>;
  private from: string;
  private templateId?: number;

  constructor(cfg: TencentSesConfig) {
    this.client = new SesClient({
      credential: { secretId: cfg.secretId, secretKey: cfg.secretKey },
      region: cfg.region,
      profile: { httpProfile: { endpoint: 'ses.tencentcloudapi.com' } }
    });
    this.from = cfg.fromEmailAddress;
    this.templateId = cfg.templateId;
  }

  async send(msg: MailMessage): Promise<void> {
    // Template 模式（个人实名账号唯一路径）
    if (this.templateId !== undefined && msg.templateData) {
      await this.client.SendEmail({
        FromEmailAddress: this.from,
        Destination: [msg.to],
        Subject: msg.subject,
        Template: {
          TemplateID: this.templateId,
          TemplateData: JSON.stringify(msg.templateData)
        }
      });
      return;
    }

    // Simple 模式（企业认证可用；个人实名走会被拒）
    // Text/Html 必须 base64 编码
    await this.client.SendEmail({
      FromEmailAddress: this.from,
      Destination: [msg.to],
      Subject: msg.subject,
      Simple: {
        Text: Buffer.from(msg.text, 'utf-8').toString('base64'),
        ...(msg.html ? { Html: Buffer.from(msg.html, 'utf-8').toString('base64') } : {})
      }
    });
  }
}
