import request from 'supertest'
import { type Application } from 'express'
import {
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus,
  NumberOfEmployees
} from 'shared-lib'
import { AppDataSource } from '../../src/database/dataSource'
import { DefaultDFSPUsers } from '../../src/database/defaultUsers'
import { MerchantEntity } from '../../src/entity/MerchantEntity'
import { CheckoutCounterEntity } from '../../src/entity/CheckoutCounterEntity'
import { MerchantLocationEntity } from '../../src/entity/MerchantLocationEntity'
import { BusinessLicenseEntity } from '../../src/entity/BusinessLicenseEntity'

export function testPostDynamicQR (app: Application): void {
  let token = ''
  let differentDFSPToken = ''
  let auditorToken = ''
  let merchantId = 0
  let checkoutCounterId = 0

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: DefaultDFSPUsers[0].email,
        password: DefaultDFSPUsers[0].password
      })
    token = login.body.token

    const otherUser = DefaultDFSPUsers.find(
      user => user.dfsp_name !== DefaultDFSPUsers[0].dfsp_name
    )
    if (otherUser == null) {
      throw new Error('A second DFSP test user is required')
    }
    const otherLogin = await request(app)
      .post('/api/v1/users/login')
      .send({ email: otherUser.email, password: otherUser.password })
    differentDFSPToken = otherLogin.body.token

    const auditor = DefaultDFSPUsers.find(user => user.role === 'DFSP Auditor')
    if (auditor == null) {
      throw new Error('A DFSP auditor test user is required')
    }
    const auditorLogin = await request(app)
      .post('/api/v1/users/login')
      .send({ email: auditor.email, password: auditor.password })
    auditorToken = auditorLogin.body.token

    const merchantResponse = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('dba_trading_name', 'Dynamic QR Merchant')
      .field('registered_name', 'Dynamic QR Merchant Ltd')
      .field('employees_num', NumberOfEmployees.ONE_TO_FIVE)
      .field('monthly_turnover', 1000)
      .field('currency_code', 'PHP')
      .field('category_code', '10410')
      .field('mcc', '5812')
      .field('merchant_type', 'Individual')
      .field('license_number', 'DYNAMIC-QR-001')
    merchantId = merchantResponse.body.data.id

    await request(app)
      .post(`/api/v1/merchants/${merchantId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        location_type: 'Physical',
        country: 'Philippines',
        town_name: 'Manila',
        checkout_description: 'Main checkout'
      })

    const merchant = await AppDataSource.getRepository(MerchantEntity).findOneOrFail({
      where: { id: merchantId },
      relations: ['checkout_counters']
    })
    checkoutCounterId = merchant.checkout_counters[0].id

    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      registration_status: MerchantRegistrationStatus.APPROVED,
      allow_block_status: MerchantAllowBlockStatus.ALLOWED
    })
    await AppDataSource.getRepository(CheckoutCounterEntity).update(checkoutCounterId, {
      alias_value: '10000001',
      guid: '581b314e257f41bfbbdc6384daa31d16'
    })
  })

  afterAll(async () => {
    await AppDataSource.getRepository(CheckoutCounterEntity).delete({ id: checkoutCounterId })
    await AppDataSource.getRepository(MerchantLocationEntity).delete({
      merchant: { id: merchantId }
    })
    await AppDataSource.getRepository(BusinessLicenseEntity).delete({
      merchant: { id: merchantId }
    })
    await AppDataSource.getRepository(MerchantEntity).delete({ id: merchantId })
  })

  it('requires authentication', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    expect(response.statusCode).toBe(401)
  })

  it('rejects invalid dynamic QR input', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 12.50, reference: '' })

    expect(response.statusCode).toBe(422)
    expect(response.body.message).toBe('Invalid dynamic QR request')
    expect(response.body.errors).toHaveProperty('amount')
    expect(response.body.errors).toHaveProperty('reference')
  })

  it('requires merchant edit permission', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    expect(response.statusCode).toBe(403)
    expect(response.body.message).toContain('Edit Merchants')
  })

  it('prevents a different DFSP from generating the QR', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${differentDFSPToken}`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    expect(response.statusCode).toBe(404)
    expect(response.body.message).toBe('Merchant not found')
  })

  it('requires an approved merchant', async () => {
    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      registration_status: MerchantRegistrationStatus.REVIEW
    })

    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      registration_status: MerchantRegistrationStatus.APPROVED
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.message).toBe('Merchant is not approved to receive payments')
  })

  it('requires the merchant to be explicitly allowed', async () => {
    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      allow_block_status: MerchantAllowBlockStatus.PENDING
    })

    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      allow_block_status: MerchantAllowBlockStatus.ALLOWED
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.message).toBe('Merchant is not approved to receive payments')
  })

  it('requires an approved MCC', async () => {
    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      mcc: null
    })

    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      mcc: '5812'
    })

    expect(response.statusCode).toBe(409)
    expect(response.body.message).toBe(
      'Merchant does not have an approved merchant category code'
    )
  })

  it('returns an EMVCo dynamic payload and PNG data URL', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters/${checkoutCounterId}/dynamic-qr`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '12.50', reference: 'ORDER-2026-00042' })

    expect(response.statusCode).toBe(200)
    expect(response.body.message).toBe('Dynamic QR generated')
    expect(response.body.data).toMatchObject({
      merchant_id: merchantId,
      checkout_counter_id: checkoutCounterId,
      amount: '12.50',
      currency: 'PHP',
      reference: 'ORDER-2026-00042'
    })
    expect(response.body.data.qr_payload).toMatch(/^000201010212/)
    expect(response.body.data.qr_payload).toContain('540512.50')
    expect(response.body.data.qr_payload).toContain('62200516ORDER-2026-00042')
    expect(response.body.data.qr_image_data_url).toMatch(/^data:image\/png;base64,/)
  })
}
