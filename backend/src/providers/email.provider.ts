/**
 * AgriShield Parametric - Email Delivery Provider
 * Gmail SMTP integration using Nodemailer
 *
 * Security Invariants:
 * 1. Plain-text credentials and OTP values are NEVER logged.
 * 2. Gmail App Password must be provided via ignored backend environment variables only.
 * 3. Connection and socket timeouts enforced to prevent thread starvation.
 * 4. Safe sanitized error reporting: internal SMTP details or credentials are never exposed.
 * 5. Dependency injection of custom transporter for automated unit/integration testing.
 */

import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';

export interface SendOtpEmailOptions {
  to: string;
  otp: string;
  recipientName?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailProvider {
  sendOtpEmail(options: SendOtpEmailOptions): Promise<EmailSendResult>;
  verifyConnection(): Promise<boolean>;
}

export class NodemailerEmailProvider implements IEmailProvider {
  private transporter: Transporter | null = null;
  private customTransporter: Transporter | null = null;

  constructor(customTransporter?: Transporter) {
    if (customTransporter) {
      this.customTransporter = customTransporter;
    }
  }

  /**
   * Lazily initialize or retrieve the Nodemailer transport instance.
   */
  private getTransporter(): Transporter {
    if (this.customTransporter) {
      return this.customTransporter;
    }

    if (!this.transporter) {
      const user = env.EMAIL_USER?.trim();
      const pass = env.EMAIL_APP_PASSWORD?.trim();

      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // SSL/TLS
        auth: {
          user,
          pass,
        },
        connectionTimeout: env.EMAIL_TIMEOUT_MS,
        greetingTimeout: env.EMAIL_TIMEOUT_MS,
        socketTimeout: env.EMAIL_TIMEOUT_MS,
      });
    }

    return this.transporter;
  }

  /**
   * Test SMTP connection and authentication.
   */
  async verifyConnection(): Promise<boolean> {
    if (!env.EMAIL_ENABLED) {
      return false;
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[EMAIL] SMTP connection verification failed: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Build plain text content for the verification email.
   */
  private buildPlainText(otp: string, recipientName?: string): string {
    const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
    return [
      'AgriShield Parametric Insurance',
      '',
      greeting,
      '',
      `Your AgriShield verification code is: ${otp}`,
      '',
      'This code expires in 5 minutes. Do not share it with anyone.',
      '',
      'If you did not request this verification code, please ignore this email.',
      '',
      '— AgriShield Automated System',
    ].join('\n');
  }

  /**
   * Build clean, responsive HTML content for the verification email.
   */
  private buildHtmlContent(otp: string, recipientName?: string): string {
    const greeting = recipientName ? `Hello <strong>${recipientName}</strong>,` : 'Hello,';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgriShield Verification Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #047857; padding: 24px 32px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #a7f3d0; }
    .content { padding: 32px; }
    .greeting { font-size: 14px; margin-bottom: 16px; }
    .instructions { font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .otp-box { background: #ecfdf5; border: 2px dashed #059669; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
    .otp-code { font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #065f46; margin: 0; }
    .warning { font-size: 12px; color: #dc2626; font-weight: 600; margin-top: 8px; }
    .meta { font-size: 12px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 16px 32px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AgriShield Parametric</h1>
      <p>Crop Climate Risk & Underwriting Security</p>
    </div>
    <div class="content">
      <div class="greeting">${greeting}</div>
      <p class="instructions">
        You requested a verification code to access your AgriShield producer account. Enter the 6-digit code below to complete authentication:
      </p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <div class="warning">Valid for 5 minutes • Do not share with anyone</div>
      </div>
      <p class="meta">
        This single-use code allows confidential access to parametric policies, claims, and farm analytics. If you did not initiate this request, no action is needed.
      </p>
    </div>
    <div class="footer">
      AgriShield Parametric Platform • Automated Security Dispatch • Do not reply
    </div>
  </div>
</body>
</html>
`.trim();
  }

  /**
   * Dispatch 6-digit OTP verification email via SMTP.
   */
  async sendOtpEmail(options: SendOtpEmailOptions): Promise<EmailSendResult> {
    const { to, otp, recipientName } = options;

    // 1. Check if email sending is enabled
    if (!env.EMAIL_ENABLED && !this.customTransporter) {
      return {
        success: false,
        error: 'Email delivery is currently disabled in environment configuration (EMAIL_ENABLED=false)',
      };
    }

    // 2. Validate configuration credentials
    const senderAddress = env.EMAIL_USER?.trim();
    if ((!senderAddress || !env.EMAIL_APP_PASSWORD?.trim()) && !this.customTransporter) {
      logger.error('[EMAIL] Attempted to dispatch email without valid EMAIL_USER or EMAIL_APP_PASSWORD');
      return {
        success: false,
        error: 'Email service credentials are missing or incomplete',
      };
    }

    try {
      const transporter = this.getTransporter();
      const fromField = env.EMAIL_FROM?.trim() || `AgriShield Notifications <${senderAddress}>`;

      const mailOptions = {
        from: fromField,
        to: to.trim().toLowerCase(),
        subject: 'AgriShield Email Verification Code',
        text: this.buildPlainText(otp, recipientName),
        html: this.buildHtmlContent(otp, recipientName),
      };

      const info = await transporter.sendMail(mailOptions);

      logger.info(`[EMAIL] Verification code dispatched successfully to ${this.maskEmail(to)}`);

      return {
        success: true,
        messageId: info?.messageId,
      };
    } catch (err: unknown) {
      const rawError = err instanceof Error ? err.message : String(err);
      // Log sanitized diagnostic without leaking credentials or OTP
      logger.error(`[EMAIL] Failed to send verification email: ${rawError}`);

      return {
        success: false,
        error: 'Unable to deliver verification email. Please check configuration or try again shortly.',
      };
    }
  }

  /**
   * Helper to mask email for safe logging (e.g. "a***e@example.com").
   */
  public maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '******';
    const [local, domain] = parts;
    if (local.length <= 2) {
      return `${local.charAt(0)}***@${domain}`;
    }
    return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
  }
}

export const emailProvider = new NodemailerEmailProvider();
