/* eslint-disable max-len */

import {
  removeMerchantDocument
} from '../../src/services/S3Client'
import request from 'supertest'
import { type Application } from 'express'
import { DefaultDFSPUsers } from '../../src/database/defaultUsers'
import fs from 'fs'
import path from 'path'
import { AppDataSource } from '../../src/database/dataSource'
import { MerchantEntity } from '../../src/entity/MerchantEntity'
import { MerchantRegistrationStatus } from 'shared-lib'
import { CheckoutCounterEntity } from '../../src/entity/CheckoutCounterEntity'
import { isMerchantAliasAvailableInRegistry } from '../../src/services/registryOracleClient'

export function testPostMerchantDraft (app: Application): void {
  let token = ''
  const dfspUserEmail = DefaultDFSPUsers[0].email
  const dfspUserPwd = DefaultDFSPUsers[0].password

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: dfspUserEmail,
        password: dfspUserPwd
      })
    token = res.body.token
  })

  it('should respond with 401 when Authorization header is missing', async () => {
    const res = await request(app).post('/api/v1/merchants/draft')
    expect(res.statusCode).toEqual(401)
  })

  it('should respond with 401 when Authorization token is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', 'Bearer invalid_token')
    expect(res.statusCode).toEqual(401)
  })

  it('should respond 422 with Validation Errors', async () => {
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('merchant_type', 'non-existing-merchant-type')

    expect(res.statusCode).toEqual(422)
    expect(res.body).toHaveProperty('message')
    expect(res.body.message).toHaveLength(1)
    expect(res.body.message[0]).toContain('merchant_type: Invalid enum value.')
  })

  it('should reject an unsupported merchant category code', async () => {
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('mcc', '1234')

    expect(res.statusCode).toEqual(422)
    expect(res.body.message).toContain('mcc: MCC is not supported')
  })

  it('should reject an unsupported business activity code', async () => {
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('category_code', 'invalid')

    expect(res.statusCode).toEqual(422)
    expect(res.body.message).toContain(
      'category_code: Business activity is not supported'
    )
  })

  it('should reject an invalid custom merchant alias', async () => {
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('payinto_alias', 'invalid alias')

    expect(res.statusCode).toEqual(422)
    expect(res.body.message).toContain(
      'payinto_alias: Alias can only contain letters, numbers, underscores, and hyphens'
    )
  })

  it('should reject a custom alias already registered in Registry Oracle', async () => {
    jest.mocked(isMerchantAliasAvailableInRegistry).mockResolvedValueOnce(false)

    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('payinto_alias', 'LBR-MER-EXISTING')

    expect(res.statusCode).toEqual(409)
    expect(res.body).toEqual({
      message: 'PayInto alias "LBR-MER-EXISTING" is already registered',
      field: 'payinto_alias'
    })
  })

  it('should reject a custom alias already used by another local counter', async () => {
    const existingCounter = await AppDataSource.manager.save(
      CheckoutCounterEntity,
      AppDataSource.manager.create(CheckoutCounterEntity, {
        alias_value: 'LBR-MER-LOCAL-EXISTING',
        counter_number: 1
      })
    )

    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('payinto_alias', 'lbr-mer-local-existing')

    expect(res.statusCode).toEqual(409)
    expect(res.body).toEqual({
      message: 'PayInto alias "lbr-mer-local-existing" is already registered',
      field: 'payinto_alias'
    })

    await AppDataSource.manager.delete(CheckoutCounterEntity, existingCounter.id)
  })

  it('should respond with 201 and merchant data when everything is valid with Draft status', async () => {
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('dba_trading_name', 'Some Trading Name')
      .field('registered_name', 'Some Registered Name')
      .field('employees_num', '1 - 5')
      .field('monthly_turnover', 0.5)
      .field('currency_code', 'PHP')
      .field('category_code', '10410')
      .field('mcc', ' 5812 ')
      .field('merchant_type', 'Individual')
      .field('payinto_alias', 'draft-valid-merchant-1')
      .field('license_number', '123456789')

    expect(res.statusCode).toEqual(201)
    expect(res.body).toHaveProperty('message')
    expect(res.body.message).toEqual('Drafting Merchant Successful')
    expect(res.body).toHaveProperty('data')
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data).toHaveProperty('registration_status')
    expect(res.body.data.registration_status).toEqual(MerchantRegistrationStatus.DRAFT)
    expect(res.body.data.mcc).toEqual('5812')
    expect(res.body.data.checkout_counters[0].alias_value).toEqual('draft-valid-merchant-1')

    const checkoutCounter = await AppDataSource.manager.findOneByOrFail(
      CheckoutCounterEntity,
      { id: res.body.data.checkout_counters[0].id }
    )
    expect(checkoutCounter.alias_value).toEqual('draft-valid-merchant-1')

    // Clean up
    await AppDataSource.manager.delete(CheckoutCounterEntity, checkoutCounter.id)
    await AppDataSource.manager.delete(MerchantEntity, res.body.data.id)
  })

  it('should respond with 201 and merchant data when everything is valid with license_document file with Draft status', async () => {
    const filePath = path.resolve(__dirname, '../test-files/dummy.pdf')
    const res = await request(app)
      .post('/api/v1/merchants/draft')
      .set('Authorization', `Bearer ${token}`)
      .field('dba_trading_name', 'Some Trading Name')
      .field('registered_name', 'Some Registered Name')
      .field('employees_num', '1 - 5')
      .field('monthly_turnover', 0.5)
      .field('currency_code', 'PHP')
      .field('category_code', '10410')
      .field('merchant_type', 'Individual')
      .field('payinto_alias', 'draft-valid-merchant-2')
      .field('license_number', '111111')
      .attach('license_document', fs.createReadStream(filePath), { filename: 'dummy.pdf' })

    expect(res.statusCode).toEqual(201)
    expect(res.body).toHaveProperty('message')
    expect(res.body.message).toEqual('Drafting Merchant Successful')
    expect(res.body).toHaveProperty('data')
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data).toHaveProperty('business_licenses')
    expect(res.body.data).toHaveProperty('registration_status')
    expect(res.body.data.registration_status).toEqual(MerchantRegistrationStatus.DRAFT)
    expect(res.body.data.business_licenses).toHaveLength(1)
    expect(res.body.data.business_licenses[0]).toHaveProperty('id')
    expect(res.body.data.business_licenses[0]).toHaveProperty('license_number')
    expect(res.body.data.business_licenses[0]).toHaveProperty('license_document_link')
    expect(res.body.data.business_licenses[0].license_document_link).toContain('dummy')
    expect(res.body.data.checkout_counters[0].alias_value).toEqual('draft-valid-merchant-2')

    // Clean up
    await removeMerchantDocument(res.body.data.business_licenses[0].license_document_link)
    await AppDataSource.manager.delete(
      CheckoutCounterEntity,
      res.body.data.checkout_counters[0].id
    )
    await AppDataSource.manager.delete(MerchantEntity, res.body.data.id)
  })
}
