import { nextTestLei } from './testLei'
import request from 'supertest'
import { type Application } from 'express'
import { MerchantRegistrationStatus, NumberOfEmployees } from 'shared-lib'
import { AppDataSource } from '../../src/database/dataSource'
import { DefaultDFSPUsers } from '../../src/database/defaultUsers'
import { CheckoutCounterEntity } from '../../src/entity/CheckoutCounterEntity'
import { MerchantEntity } from '../../src/entity/MerchantEntity'
import { registerMerchantsWithRegistry } from '../../src/services/registryOracleClient'

export function testPostApprovedCheckoutCounter (app: Application): void {
  let token = ''
  let merchantId = 0
  let locationId = 0

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: DefaultDFSPUsers[0].email,
        password: DefaultDFSPUsers[0].password
      })
    token = login.body.token

    const draft = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('lei', nextTestLei())
      .field('dba_trading_name', 'Approved Counter Test Merchant')
      .field('registered_name', 'Approved Counter Test Merchant')
      .field('employees_num', NumberOfEmployees.ONE_TO_FIVE)
      .field('monthly_turnover', 0.5)
      .field('currency_code', 'PHP')
      .field('category_code', '10410')
      .field('mcc', '0742')
      .field('merchant_type', 'Individual')
      .field('license_number', 'COUNTER-TEST-1')
    merchantId = draft.body.data.id

    const location = await request(app)
      .post(`/api/v1/merchants/${merchantId}/locations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        location_type: 'Physical',
        country: 'United States of America',
        town_name: 'Townsville',
        checkout_counters: [{ description: 'Primary counter' }]
      })
    locationId = location.body.data.id

    await AppDataSource.getRepository(MerchantEntity).update(merchantId, {
      registration_status: MerchantRegistrationStatus.APPROVED
    })
  })

  afterAll(async () => {
    await AppDataSource.query('PRAGMA foreign_keys = OFF;')
    await AppDataSource.getRepository(MerchantEntity).delete(merchantId)
    await AppDataSource.query('PRAGMA foreign_keys = ON;')
  })

  it('requires an idempotency key', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters`)
      .set('Authorization', `Bearer ${token}`)
      .send({ location_id: locationId, description: 'Express counter' })

    expect(response.statusCode).toBe(400)
    expect(response.body.message).toBe('A valid Idempotency-Key header is required')
  })

  it('adds and registers one monotonically numbered counter', async () => {
    const callCount = jest.mocked(registerMerchantsWithRegistry).mock.calls.length
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'approved-counter-test-key')
      .send({ location_id: locationId, description: 'Express counter' })

    expect(response.statusCode).toBe(201)
    expect(response.headers['idempotency-replayed']).toBe('false')
    expect(response.body.data).toEqual(expect.objectContaining({
      counter_number: 2,
      description: 'Express counter',
      alias_value: expect.stringMatching(/-02$/)
    }))
    expect(jest.mocked(registerMerchantsWithRegistry)).toHaveBeenCalledTimes(callCount + 1)
    expect(jest.mocked(registerMerchantsWithRegistry)).toHaveBeenLastCalledWith(
      [expect.objectContaining({
        merchant_id: merchantId,
        checkout_counter_number: 2,
        checkout_counter_id: response.body.data.id
      })],
      expect.any(String)
    )
  })

  it('replays the same request without creating another counter', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'approved-counter-test-key')
      .send({ location_id: locationId, description: 'Express counter' })

    const counters = await AppDataSource.getRepository(CheckoutCounterEntity).find({
      where: { merchant: { id: merchantId } }
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['idempotency-replayed']).toBe('true')
    expect(counters).toHaveLength(2)
  })

  it('retries registration for a pending counter without creating one', async () => {
    const countersBefore = await AppDataSource.getRepository(CheckoutCounterEntity).count({
      where: { merchant: { id: merchantId } }
    })
    const createdCounter = await AppDataSource.getRepository(CheckoutCounterEntity).findOneOrFail({
      where: {
        merchant: { id: merchantId },
        counter_number: 2
      }
    })

    const response = await request(app)
      .post(
        `/api/v1/merchants/${merchantId}/checkout-counters/${createdCounter.id}/registration`
      )
      .set('Authorization', `Bearer ${token}`)

    const countersAfter = await AppDataSource.getRepository(CheckoutCounterEntity).count({
      where: { merchant: { id: merchantId } }
    })
    expect(response.statusCode).toBe(200)
    expect(response.body.data.id).toBe(createdCounter.id)
    expect(countersAfter).toBe(countersBefore)
  })

  it('rejects reuse of an idempotency key for a different request', async () => {
    const response = await request(app)
      .post(`/api/v1/merchants/${merchantId}/checkout-counters`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'approved-counter-test-key')
      .send({ location_id: locationId, description: 'Different counter' })

    expect(response.statusCode).toBe(409)
    expect(response.body.message).toContain('different request')
  })
}
