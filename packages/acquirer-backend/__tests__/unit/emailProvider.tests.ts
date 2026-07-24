import {
  createEmailProvider
} from '../../src/services/email'

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn()
}))

describe('email provider factory', () => {
  const originalApiKey = process.env.SENDGRID_API_KEY
  const originalEmailFrom = process.env.EMAIL_FROM

  afterEach(() => {
    if (originalApiKey == null) {
      delete process.env.SENDGRID_API_KEY
    } else {
      process.env.SENDGRID_API_KEY = originalApiKey
    }
    if (originalEmailFrom == null) {
      delete process.env.EMAIL_FROM
    } else {
      process.env.EMAIL_FROM = originalEmailFrom
    }
  })

  it('uses the disabled provider by default', async () => {
    const provider = createEmailProvider('none')
    expect(provider.enabled).toBe(false)
    expect(await provider.checkHealth()).toEqual({
      enabled: false,
      provider: 'none',
      status: 'disabled'
    })
  })

  it('requires explicit SendGrid configuration', () => {
    delete process.env.SENDGRID_API_KEY
    delete process.env.EMAIL_FROM
    expect(() => createEmailProvider('sendgrid')).toThrow(
      'EMAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY and EMAIL_FROM'
    )
  })

  it('rejects unknown providers', () => {
    expect(() => createEmailProvider('smtp')).toThrow(
      'Unsupported EMAIL_PROVIDER: smtp'
    )
  })
})
