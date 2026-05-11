import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound transactional-email port (research D7). Services depend only on
 * this interface; tests inject a `FakeEmailAdapter` that records sent
 * messages in memory.
 */
export interface EmailPort {
  /**
   * Send an account-verification email containing a one-time link.
   * @param to - Recipient email address.
   * @param token - Opaque verification token (will be embedded in the URL).
   * @param url - Fully-formed verification URL the user clicks.
   * @returns Promise resolving when the email is queued for delivery.
   */
  sendVerification(to: string, token: string, url: string): Promise<void>;

  /**
   * Send a password-reset email containing a one-time link.
   * @param to - Recipient email address.
   * @param token - Opaque reset token.
   * @param url - Fully-formed reset URL.
   * @returns Promise resolving when the email is queued for delivery.
   */
  sendPasswordReset(to: string, token: string, url: string): Promise<void>;
}

/**
 * Production adapter that forwards messages through SMTP via Nodemailer.
 */
export class NodemailerEmailAdapter implements EmailPort {
  private readonly transport: Transporter;
  private readonly from: string;

  /**
   * @param smtpUrl - SMTP connection URL (e.g. `smtp://localhost:1025`).
   * @param from - Default `From` header value.
   */
  constructor(smtpUrl: string, from = 'no-reply@auth.local') {
    this.transport = nodemailer.createTransport(smtpUrl);
    this.from = from;
  }

  /** @inheritdoc */
  async sendVerification(to: string, _token: string, url: string): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to,
      subject: 'Verify your email',
      text: `Please verify your account by visiting: ${url}`,
    });
  }

  /** @inheritdoc */
  async sendPasswordReset(to: string, _token: string, url: string): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to,
      subject: 'Password reset request',
      text: `Reset your password by visiting: ${url}\n\nIf you did not request this, ignore this email.`,
    });
  }
}
