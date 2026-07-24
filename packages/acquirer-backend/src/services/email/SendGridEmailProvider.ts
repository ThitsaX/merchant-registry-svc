import sgMail from '@sendgrid/mail'
import logger from '../logger'
import {
  type AccountCreatedEmail,
  type EmailProvider,
  type EmailProviderHealth,
  type PasswordResetEmail,
  type TemporaryPasswordResetEmail
} from './EmailProvider'

function escapeHtml (value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export class SendGridEmailProvider implements EmailProvider {
  readonly name = 'sendgrid'
  readonly enabled = true

  constructor (
    private readonly apiKey: string,
    private readonly from: string
  ) {
    sgMail.setApiKey(apiKey)
  }

  async sendAccountCreated ({ to, name, role }: AccountCreatedEmail): Promise<void> {
    await sgMail.send({
      to,
      from: this.from,
      subject: 'Your Merchant Acquiring System account',
      html: `
        <p>Dear ${escapeHtml(name)},</p>
        <p>Your account has been created with the role ${escapeHtml(role)}.</p>
        <p>Please contact your administrator for your temporary password. You will
        be required to replace it when you first sign in.</p>
      `
    })
  }

  async sendPasswordReset ({ to, resetUrl }: PasswordResetEmail): Promise<void> {
    const safeResetUrl = escapeHtml(resetUrl)
    await sgMail.send({
      to,
      from: this.from,
      subject: 'Reset your Merchant Acquiring System password',
      html: `
        <p>Please ignore this email if you did not request a password reset.</p>
        <p><a href="${safeResetUrl}">Reset your password</a></p>
      `
    })
  }

  async sendTemporaryPasswordReset ({
    to,
    name
  }: TemporaryPasswordResetEmail): Promise<void> {
    await sgMail.send({
      to,
      from: this.from,
      subject: 'Your temporary Merchant Acquiring System password was reset',
      html: `
        <p>Dear ${escapeHtml(name)},</p>
        <p>An administrator reset your password.</p>
        <p>Please contact your administrator for the new temporary password. You
        will be required to replace it when you next sign in.</p>
      `
    })
  }

  async checkHealth (): Promise<EmailProviderHealth> {
    try {
      const response = await sgMail.send({
        to: 'test@example.com',
        from: this.from,
        subject: 'Email provider health check',
        text: 'Email provider health check',
        mailSettings: {
          sandboxMode: {
            enable: true
          }
        }
      })

      return {
        enabled: true,
        provider: this.name,
        status: response[0]?.statusCode === 200 ? 'healthy' : 'unhealthy'
      }
    } catch (error) {
      logger.error('SendGrid health check failed: %o', error)
      return {
        enabled: true,
        provider: this.name,
        status: 'unhealthy'
      }
    }
  }
}
