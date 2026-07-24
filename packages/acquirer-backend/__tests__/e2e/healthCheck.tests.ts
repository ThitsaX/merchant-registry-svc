import request from 'supertest'
import { type Application } from 'express'

export function testSucceedHealthCheck (app: Application): void {
  it('should respond 200 status with OK message', async () => {
  // Arrange
  // Act
    const res = await request(app)
      .get('/api/v1/health-check')

    // Assert
    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveProperty('message')
    expect(res.body.message).toEqual('OK')
  })
}

export function testSucceedHealthCheckSendGridService (app: Application): void {
  describe('Email provider health-check route', () => {
    it('should report disabled email as healthy optional configuration', async () => {
      const res = await request(app)
        .get('/api/v1/health-check/email-service')

      expect(res.statusCode).toEqual(200)
      expect(res.body).toEqual({
        enabled: false,
        provider: 'none',
        status: 'disabled'
      })
    })

    it('should preserve the legacy SendGrid health-check URL as an alias', async () => {
      const res = await request(app)
        .get('/api/v1/health-check/sendgrid-email-service')

      expect(res.statusCode).toEqual(200)
      expect(res.body.status).toEqual('disabled')
    })
  })
}
