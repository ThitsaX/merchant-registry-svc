import request from 'supertest'
import { type Application } from 'express'
import { registerEndpointDFSP } from '../../src/services/registerEndpointDFSP'
import { AppDataSource } from '../../src/database/dataSource'
import { RegistryEntity } from '../../src/entity/RegistryEntity'

export function POSTParticipantsTests (app: Application): void {
  const dfspData = {
    fspId: 'testFspId',
    dfsp_name: 'Test DFSP',
    client_secret: 'random-secret-key'
  }

  beforeAll(async () => {
    await registerEndpointDFSP(dfspData)
  })

  beforeEach(async () => {
    await AppDataSource.query('PRAGMA foreign_keys = OFF;')
    await AppDataSource.manager.clear(RegistryEntity)
    await AppDataSource.query('PRAGMA foreign_keys = ON;')
  })

  it('should return 400 when missing x-api-key header', async () => {
    // Arrange
    const participants = [
      {
        merchant_id: '610001',
        currency: 'USD',
        alias_value: '610001'
      }
    ]

    // Act
    const res = await request(app)
      .post('/participants')
      .send(participants)
    // Assert
    expect(res.status).toBe(400)
    expect(res.body).toBeInstanceOf(Object)
    expect(res.body).toHaveProperty('errorInformation')
    expect(res.body.errorInformation.errorCode).toBe('3002')
    expect(res.body.errorInformation.errorDescription).toBe('Missing header: x-api-key')
  })

  it('should return 200 with array of participants', async () => {
    // Arrange
    const participants = [
      {
        merchant_id: '600001',
        currency: 'USD',
        alias_value: '600001'
      },
      {
        merchant_id: '600002',
        currency: 'EUR',
        alias_value: 'abc1234'
      },
      {
        merchant_id: '600003',
        currency: 'JPY'
        // alias_value will be generated
      }
    ]

    // Act
    const res = await request(app)
      .post('/participants')
      .set('x-api-key', dfspData.client_secret)
      .send(participants)

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toBeInstanceOf(Array)
    expect(res.body.length).toBe(3)

    const participant = res.body[0]
    expect(participant).toHaveProperty('merchant_id')
    expect(participant).toHaveProperty('alias_value')

    expect(participant.merchant_id).toBe(participants[0].merchant_id)
    expect(participant.alias_value).toBe(participants[0].alias_value)

    expect(res.body[1].merchant_id).toBe(participants[1].merchant_id)
    expect(res.body[1].alias_value).toBe(participants[1].alias_value)

    expect(res.body[2].merchant_id).toBe(participants[2].merchant_id)
    expect(res.body[2].alias_value.length).toBeGreaterThan(0) // alias_value will be generated
  })

  it('should accept supported alphanumeric alias formats', async () => {
    const participants = [
      {
        merchant_id: '600011',
        currency: 'USD',
        alias_value: 'abc1234'
      },
      {
        merchant_id: '600012',
        currency: 'EUR',
        alias_value: 'SHOP_12-test'
      },
      {
        merchant_id: '600013',
        currency: 'JPY',
        alias_value: 600013
      }
    ]

    const res = await request(app)
      .post('/participants')
      .set('x-api-key', dfspData.client_secret)
      .send(participants)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({ success: true, alias_value: 'abc1234' }),
      expect.objectContaining({ success: true, alias_value: 'SHOP_12-test' }),
      expect.objectContaining({ success: true, alias_value: '600013' })
    ])

    const lookupRes = await request(app)
      .get('/participants/MERCHANT_PAYINTOID/abc1234')

    expect(lookupRes.status).toBe(200)
    expect(lookupRes.body.partyList[0]).toEqual(expect.objectContaining({
      alias_value: 'abc1234',
      fspId: dfspData.fspId
    }))
  })

  it.each([
    ['an empty alias', ''],
    ['an alias containing spaces', 'abc 1234'],
    ['an alias containing path characters', 'abc/1234'],
    ['an alias longer than 32 characters', 'a'.repeat(33)]
  ])('should reject %s', async (_description, aliasValue) => {
    const res = await request(app)
      .post('/participants')
      .set('x-api-key', dfspData.client_secret)
      .send([{
        merchant_id: '600021',
        currency: 'USD',
        alias_value: aliasValue
      }])

    expect(res.status).toBe(200)
    expect(res.body[0]).toEqual(expect.objectContaining({
      success: false,
      message: 'Invalid Alias Value - use 1-32 letters, numbers, underscores, or hyphens',
      alias_value: null
    }))
  })

  it('should reject a duplicate alphanumeric alias', async () => {
    const res = await request(app)
      .post('/participants')
      .set('x-api-key', dfspData.client_secret)
      .send([
        {
          merchant_id: '600031',
          currency: 'USD',
          alias_value: 'abc1234'
        },
        {
          merchant_id: '600032',
          currency: 'USD',
          alias_value: 'abc1234'
        }
      ])

    expect(res.status).toBe(200)
    expect(res.body[0]).toEqual(expect.objectContaining({
      success: true,
      alias_value: 'abc1234'
    }))
    expect(res.body[1]).toEqual(expect.objectContaining({
      success: false,
      message: 'Alias Value already exists',
      alias_value: null
    }))
  })
}
