import logger from '../logger'
import { DisabledEmailProvider } from './DisabledEmailProvider'
import {
  type AccountCreatedEmail,
  type EmailDelivery,
  type EmailProvider,
  type TemporaryPasswordResetEmail
} from './EmailProvider'
import { SendGridEmailProvider } from './SendGridEmailProvider'

let emailProvider: EmailProvider | undefined

export function createEmailProvider (
  providerName = process.env.EMAIL_PROVIDER ?? 'none'
): EmailProvider {
  const normalizedName = providerName.trim().toLowerCase()

  if (normalizedName === '' || normalizedName === 'none' || normalizedName === 'disabled') {
    return new DisabledEmailProvider()
  }

  if (normalizedName === 'sendgrid') {
    const apiKey = process.env.SENDGRID_API_KEY?.trim()
    const from = (process.env.EMAIL_FROM ?? process.env.SENDER_EMAIL)?.trim()

    if (apiKey == null || apiKey === '' || from == null || from === '') {
      throw new Error(
        'EMAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY and EMAIL_FROM'
      )
    }

    return new SendGridEmailProvider(apiKey, from)
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: ${providerName}`)
}

export function getEmailProvider (): EmailProvider {
  emailProvider ??= createEmailProvider()
  return emailProvider
}

export function resetEmailProviderForTests (): void {
  emailProvider = undefined
}

export async function sendAccountCreatedNotification (
  email: AccountCreatedEmail
): Promise<EmailDelivery> {
  let provider: EmailProvider

  try {
    provider = getEmailProvider()
  } catch (error) {
    logger.error('Email provider configuration is invalid: %o', error)
    return {
      provider: process.env.EMAIL_PROVIDER ?? 'none',
      status: 'failed'
    }
  }

  if (!provider.enabled) {
    return { provider: provider.name, status: 'disabled' }
  }

  try {
    await provider.sendAccountCreated(email)
    return { provider: provider.name, status: 'sent' }
  } catch (error) {
    logger.error('Account-created email delivery failed: %o', error)
    return { provider: provider.name, status: 'failed' }
  }
}

export async function sendTemporaryPasswordResetNotification (
  email: TemporaryPasswordResetEmail
): Promise<EmailDelivery> {
  let provider: EmailProvider

  try {
    provider = getEmailProvider()
  } catch (error) {
    logger.error('Email provider configuration is invalid: %o', error)
    return {
      provider: process.env.EMAIL_PROVIDER ?? 'none',
      status: 'failed'
    }
  }

  if (!provider.enabled) {
    return { provider: provider.name, status: 'disabled' }
  }

  try {
    await provider.sendTemporaryPasswordReset(email)
    return { provider: provider.name, status: 'sent' }
  } catch (error) {
    logger.error('Temporary-password-reset email delivery failed: %o', error)
    return { provider: provider.name, status: 'failed' }
  }
}
