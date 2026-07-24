export interface AccountCreatedEmail {
  to: string
  name: string
  role: string
}

export interface PasswordResetEmail {
  to: string
  resetUrl: string
}

export interface TemporaryPasswordResetEmail {
  to: string
  name: string
}

export interface EmailProviderHealth {
  enabled: boolean
  provider: string
  status: 'disabled' | 'healthy' | 'unhealthy'
}

export interface EmailProvider {
  readonly name: string
  readonly enabled: boolean
  sendAccountCreated: (email: AccountCreatedEmail) => Promise<void>
  sendTemporaryPasswordReset: (email: TemporaryPasswordResetEmail) => Promise<void>
  sendPasswordReset: (email: PasswordResetEmail) => Promise<void>
  checkHealth: () => Promise<EmailProviderHealth>
}

export interface EmailDelivery {
  provider: string
  status: 'disabled' | 'sent' | 'failed'
}
