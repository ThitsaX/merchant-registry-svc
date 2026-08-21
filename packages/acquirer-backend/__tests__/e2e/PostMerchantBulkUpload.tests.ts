import { type Application } from 'express'
import { type Worksheet } from 'exceljs'
import request from 'supertest'
import { MerchantRegistrationStatus } from 'shared-lib'
import { AppDataSource } from '../../src/database/dataSource'
import { DefaultDFSPUsers } from '../../src/database/defaultUsers'
import { BusinessLicenseEntity } from '../../src/entity/BusinessLicenseEntity'
import { BusinessOwnerEntity } from '../../src/entity/BusinessOwnerEntity'
import { BusinessPersonLocationEntity } from '../../src/entity/BusinessPersonLocationEntity'
import { CheckoutCounterEntity } from '../../src/entity/CheckoutCounterEntity'
import { ContactPersonEntity } from '../../src/entity/ContactPersonEntity'
import { MerchantBulkImportEntity } from '../../src/entity/MerchantBulkImportEntity'
import { MerchantEntity } from '../../src/entity/MerchantEntity'
import { MerchantLocationEntity } from '../../src/entity/MerchantLocationEntity'
import { createBulkMerchantTemplate } from '../../src/utils/merchantBulkWorkbook'

function setRow (
  worksheet: Worksheet,
  rowNumber: number,
  values: Record<string, string>
): void {
  const headers = new Map<string, number>()
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(cell.text, columnNumber)
  })
  for (const [header, value] of Object.entries(values)) {
    worksheet.getRow(rowNumber).getCell(headers.get(header) as number).value = value
  }
}

async function workbookBuffer (): Promise<Buffer> {
  const workbook = createBulkMerchantTemplate()
  setRow(workbook.getWorksheet('Merchants') as Worksheet, 2, {
    merchant_reference: 'BULK_E2E_001',
    dba_trading_name: 'Bulk Test Merchant',
    lei: 'BULKLEI0000000000001',
    employees_num: '1 - 5',
    currency_code: 'LRD',
    category_code: '10410',
    mcc: '5812',
    merchant_type: 'Small Shop',
    payinto_alias: 'BULK-E2E-ALIAS',
    license_number: 'BULK-LICENSE'
  })
  setRow(workbook.getWorksheet('Locations') as Worksheet, 2, {
    merchant_reference: 'BULK_E2E_001',
    location_reference: 'MAIN',
    location_type: 'Physical',
    town_name: 'Monrovia',
    country: 'Liberia'
  })
  setRow(workbook.getWorksheet('Checkout Counters') as Worksheet, 2, {
    merchant_reference: 'BULK_E2E_001',
    location_reference: 'MAIN',
    description: 'Main till'
  })
  setRow(workbook.getWorksheet('Business Owners') as Worksheet, 2, {
    merchant_reference: 'BULK_E2E_001',
    name: 'Bulk Owner',
    identification_type: 'National ID',
    identification_number: 'BULK-ID',
    phone_number: '+231770000001'
  })
  setRow(workbook.getWorksheet('Contact Persons') as Worksheet, 2, {
    merchant_reference: 'BULK_E2E_001',
    name: 'Bulk Contact',
    phone_number: '+231770000002',
    email: 'bulk@example.com'
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function testPostMerchantBulkUpload (app: Application): void {
  let token = ''
  let merchantId: number | undefined
  let importId: number | undefined

  beforeAll(async () => {
    const response = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: DefaultDFSPUsers[0].email,
        password: DefaultDFSPUsers[0].password
      })
    token = response.body.token
  })

  afterAll(async () => {
    if (merchantId !== undefined) {
      const merchant = await AppDataSource.getRepository(MerchantEntity).findOne({
        where: { id: merchantId },
        relations: [
          'checkout_counters',
          'locations',
          'business_licenses',
          'business_owners',
          'business_owners.businessPersonLocation',
          'contact_persons',
          'dfsps'
        ]
      })
      if (merchant !== null) {
        await AppDataSource.manager.remove(ContactPersonEntity, merchant.contact_persons)
        await AppDataSource.manager.remove(CheckoutCounterEntity, merchant.checkout_counters)
        await AppDataSource.manager.remove(BusinessLicenseEntity, merchant.business_licenses)
        await AppDataSource.manager.remove(MerchantLocationEntity, merchant.locations)
        const owners = merchant.business_owners
        const ownerLocations = owners
          .map(owner => owner.businessPersonLocation)
          .filter(location => location !== undefined)
        merchant.business_owners = []
        merchant.dfsps = []
        await AppDataSource.manager.save(MerchantEntity, merchant)
        await AppDataSource.manager.remove(BusinessOwnerEntity, owners)
        await AppDataSource.manager.remove(BusinessPersonLocationEntity, ownerLocations)
        await AppDataSource.manager.remove(MerchantEntity, merchant)
      }
    }
    if (importId !== undefined) {
      await AppDataSource.manager.delete(MerchantBulkImportEntity, importId)
    }
  })

  it('downloads the workbook template', async () => {
    const response = await request(app)
      .get('/api/v1/merchants/bulk-upload/template')
      .set('Authorization', `Bearer ${token}`)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(response.headers['content-disposition'])
      .toBe('attachment; filename=merchant-onboarding-template.xlsx')
  })

  it('requires an idempotency key', async () => {
    const response = await request(app)
      .post('/api/v1/merchants/bulk-upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await workbookBuffer(), 'merchants.xlsx')

    expect(response.statusCode).toBe(400)
    expect(response.body.message).toContain('Idempotency-Key')
  })

  it('atomically creates a review-ready merchant and replays safely', async () => {
    const buffer = await workbookBuffer()
    const first = await request(app)
      .post('/api/v1/merchants/bulk-upload')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'merchant-bulk-e2e-1')
      .attach('file', buffer, 'merchants.xlsx')

    expect(first.statusCode).toBe(201)
    expect(first.body.data).toMatchObject({
      merchants_created: 1,
      locations_created: 1,
      checkout_counters_created: 1,
      business_owners_created: 1,
      contact_persons_created: 1
    })
    merchantId = first.body.data.merchant_ids[0].merchant_id
    importId = first.body.data.import_id

    const merchant = await AppDataSource.getRepository(MerchantEntity).findOne({
      where: { id: merchantId },
      relations: ['checkout_counters', 'locations', 'business_owners', 'contact_persons']
    })
    expect(merchant).toMatchObject({
      registration_status: MerchantRegistrationStatus.REVIEW,
      mcc: '5812'
    })
    expect(merchant?.checkout_counters[0]).toMatchObject({
      counter_number: 1,
      alias_value: 'BULK-E2E-ALIAS',
      description: 'Main till'
    })

    const replay = await request(app)
      .post('/api/v1/merchants/bulk-upload')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'merchant-bulk-e2e-1')
      .attach('file', buffer, 'merchants.xlsx')

    expect(replay.statusCode).toBe(200)
    expect(replay.body.data).toMatchObject({
      import_id: importId,
      merchants_created: 1,
      idempotent_replay: true
    })
  })

  it('rejects a bulk LEI already registered by a DFSP and names the owner', async () => {
    const merchant = await AppDataSource.getRepository(MerchantEntity).findOneOrFail({
      where: { id: merchantId },
      relations: ['default_dfsp']
    })
    const response = await request(app)
      .post('/api/v1/merchants/bulk-upload')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'merchant-bulk-e2e-duplicate-lei')
      .attach('file', await workbookBuffer(), 'merchants.xlsx')

    expect(response.statusCode).toBe(422)
    expect(response.body.errors).toContainEqual({
      sheet: 'Merchants',
      row: 2,
      field: 'lei',
      message: 'LEI "BULKLEI0000000000001" is already registered with ' +
        `DFSP "${merchant.default_dfsp.name}" (${merchant.default_dfsp.fspId})`
    })
  })
}
