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
}

/**
 * 腾讯云 SES HTTP API adapter（用于个人实名账号无法走 SMTP 的情况）。
 *
 * 用 Simple 模式（直接传文本/HTML body），不依赖 SES 控制台模板。
 * 配额：免费版个人认证 100 封/日；企业认证 1000 封/日。
 *
 * 错误透传：SDK 抛 TencentCloudSDKError，调用方（auth route）已 catch 兜底。
 * 常见错：
 *   - InvalidParameter.FromAddressInvalid → 发信地址未验证或拼写错
 *   - LimitExceeded → 当日额度用完
 *   - AuthFailure → SecretId/SecretKey 错或子账号没权限
 */
export class TencentSesMailSender implements MailSender {
  private client: InstanceType<typeof SesClient>;
  private from: string;

  constructor(cfg: TencentSesConfig) {
    this.client = new SesClient({
      credential: { secretId: cfg.secretId, secretKey: cfg.secretKey },
      region: cfg.region,
      profile: { httpProfile: { endpoint: 'ses.tencentcloudapi.com' } }
    });
    this.from = cfg.fromEmailAddress;
  }

  async send(msg: MailMessage): Promise<void> {
    await this.client.SendEmail({
      FromEmailAddress: this.from,
      Destination: [msg.to],
      Subject: msg.subject,
      Simple: {
        Text: msg.text,
        ...(msg.html ? { Html: msg.html } : {})
      }
    });
  }
}
