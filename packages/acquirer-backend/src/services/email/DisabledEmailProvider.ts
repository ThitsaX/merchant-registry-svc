import {
  type AccountCreatedEmail,
  type EmailProvider,
  type EmailProviderHealth,
  type PasswordResetEmail,
  type TemporaryPasswordResetEmail
} from './EmailProvider'

export class DisabledEmailProvider implements EmailProvider {
  readonly name = 'none'
  readonly enabled = false

  async sendAccountCreated (_email: AccountCreatedEmail): Promise<void> {}

  async sendTemporaryPasswordReset (_email: TemporaryPasswordResetEmail): Promise<void> {}

  async sendPasswordReset (_email: PasswordResetEmail): Promise<void> {}

  async checkHealth (): Promise<EmailProviderHealth> {
    return {
      enabled: false,
      provider: this.name,
      status: 'disabled'
    }
  }
}
