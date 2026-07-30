/* eslint-disable @typescript-eslint/explicit-function-return-type */
import request from 'supertest'
import { type Application } from 'express'
import { AppDataSource } from '../../src/database/dataSource'
import { IdempotencyRecordEntity } from '../../src/entity/IdempotencyRecordEntity'
import { RegistryEntity } from '../../src/entity/RegistryEntity'
import { APIAccessEntity } from '../../src/entity/APIAccessEntity'
import { DFSPEntity } from '../../src/entity/DFSPEntity'

const INTERNAL_API_KEY = 'change-me'

export function internalRoutesTests (app: Application): void {
  beforeEach(async () => {
    await AppDataSource.query('PRAGMA foreign_keys = OFF;')
    await AppDataSource.manager.clear(IdempotencyRecordEntity)
    await AppDataSource.manager.clear(RegistryEntity)
    await AppDataSource.manager.clear(APIAccessEntity)
    await AppDataSource.manager.clear(DFSPEntity)
    await AppDataSource.query('PRAGMA foreign_keys = ON;')
  })

  it('rejects internal requests without authentication', async () => {
    const response = await request(app)
      .post('/internal/v1/merchants/registrations')
      .set('Idempotency-Key', 'unauthenticated-request')
      .send({ merchants: [] })

    expect(response.status).toBe(401)
  })

  it('replays an idempotent merchant registration without duplicate records', async () => {
    const body = {
      merchants: [{
        merchant_id: 77001,
        fspId: 'fsp-internal',
        dfsp_name: 'Internal DFSP',
        checkout_counter_id: 77101,
        currency_code: {
          iso_code: 'USD',
          description: 'US Dollar'
        }
      }]
    }

    const firstResponse = await request(app)
      .post('/internal/v1/merchants/registrations')
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Idempotency-Key', 'merchant-registration-1')
      .send(body)
    const replayResponse = await request(app)
      .post('/internal/v1/merchants/registrations')
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Idempotency-Key', 'merchant-registration-1')
      .send(body)

    expect(firstResponse.status).toBe(200)
    expect(firstResponse.headers['idempotency-replayed']).toBe('false')
    expect(replayResponse.status).toBe(200)
    expect(replayResponse.headers['idempotency-replayed']).toBe('true')
    expect(replayResponse.body).toEqual(firstResponse.body)
    expect(await AppDataSource.manager.count(RegistryEntity)).toBe(1)
  })

  it('rejects reuse of an idempotency key with a different request', async () => {
    const requestWithMerchantId = async (merchantId: number) => await request(app)
      .post('/internal/v1/merchants/registrations')
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Idempotency-Key', 'conflicting-request')
      .send({
        merchants: [{
          merchant_id: merchantId,
          fspId: 'fsp-internal',
          dfsp_name: 'Internal DFSP',
          checkout_counter_id: merchantId + 100,
          currency_code: {
            iso_code: 'USD',
            description: 'US Dollar'
          }
        }]
      })

    expect((await requestWithMerchantId(77201)).status).toBe(200)
    expect((await requestWithMerchantId(77202)).status).toBe(409)
  })

  it('registers a caller-provided merchant alias', async () => {
    const response = await request(app)
      .post('/internal/v1/merchants/registrations')
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Idempotency-Key', 'custom-merchant-alias')
      .send({
        merchants: [{
          merchant_id: 77301,
          fspId: 'fsp-internal',
          dfsp_name: 'Internal DFSP',
          checkout_counter_id: 77401,
          alias_value: 'LBR-MER-00012345',
          currency_code: {
            iso_code: 'USD',
            description: 'US Dollar'
          }
        }]
      })

    expect(response.status).toBe(200)
    expect(response.body.data[0].alias_value).toBe('LBR-MER-00012345')
  })

  it('rejects malformed and duplicate merchant aliases', async () => {
    const register = async (
      merchantId: number,
      checkoutCounterId: number,
      aliasValue: string,
      idempotencyKey: string
    ) => await request(app)
      .post('/internal/v1/merchants/registrations')
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        merchants: [{
          merchant_id: merchantId,
          fspId: 'fsp-internal',
          dfsp_name: 'Internal DFSP',
          checkout_counter_id: checkoutCounterId,
          alias_value: aliasValue,
          currency_code: {
            iso_code: 'USD',
            description: 'US Dollar'
          }
        }]
      })

    expect((await register(77501, 77601, 'bad alias', 'invalid-alias')).status).toBe(400)
    expect((await register(77502, 77602, 'UNIQUE-ALIAS', 'unique-alias-1')).status).toBe(200)

    const duplicate = await register(77503, 77603, 'UNIQUE-ALIAS', 'unique-alias-2')
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.message).toContain('already registered')
  })

  it('replays DFSP credential registration without duplicate credentials', async () => {
    const register = async () => await request(app)
      .put('/internal/v1/dfsps/fsp-credential/access-credential')
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Idempotency-Key', 'dfsp-credential-1')
      .send({
        dfsp_name: 'Credential DFSP',
        client_secret: 'MR-test-client-secret'
      })

    expect((await register()).status).toBe(200)
    const replayResponse = await register()

    expect(replayResponse.status).toBe(200)
    expect(replayResponse.headers['idempotency-replayed']).toBe('true')
    expect(await AppDataSource.manager.count(DFSPEntity)).toBe(1)
    expect(await AppDataSource.manager.count(APIAccessEntity)).toBe(1)
  })
}
