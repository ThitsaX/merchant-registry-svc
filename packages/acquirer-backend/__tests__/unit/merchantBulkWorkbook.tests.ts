import { Workbook, type Cell, type Worksheet } from 'exceljs'
import {
  createBulkMerchantTemplate,
  parseBulkMerchantWorkbook
} from '../../src/utils/merchantBulkWorkbook'

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

function cellForHeader (
  worksheet: Worksheet,
  header: string,
  rowNumber = 2
): Cell {
  let columnNumber = -1
  worksheet.getRow(1).eachCell((cell, currentColumnNumber) => {
    if (cell.text === header) columnNumber = currentColumnNumber
  })
  return worksheet.getCell(rowNumber, columnNumber)
}

async function validWorkbookBuffer (): Promise<Buffer> {
  const workbook = createBulkMerchantTemplate()
  setRow(workbook.getWorksheet('Merchants') as Worksheet, 2, {
    merchant_reference: 'MERCHANT_001',
    dba_trading_name: 'Prima Center',
    registered_name: 'Prima Center LLC',
    lei: 'TESTLEI0000000000001',
    employees_num: '1 - 5',
    monthly_turnover: '1500.50',
    currency_code: 'LRD',
    category_code: '10410',
    mcc: '5812',
    merchant_type: 'Small Shop',
    payinto_alias: 'LBR-MER-0001234',
    license_number: 'LIC-100'
  })
  setRow(workbook.getWorksheet('Locations') as Worksheet, 2, {
    merchant_reference: 'MERCHANT_001',
    location_reference: 'MAIN',
    location_type: 'Physical',
    town_name: 'Monrovia',
    country: 'Liberia',
    postal_code: '1000'
  })
  setRow(workbook.getWorksheet('Checkout Counters') as Worksheet, 2, {
    merchant_reference: 'MERCHANT_001',
    location_reference: 'MAIN',
    description: 'Main till'
  })
  setRow(workbook.getWorksheet('Business Owners') as Worksheet, 2, {
    merchant_reference: 'MERCHANT_001',
    name: 'Jane Doe',
    identification_type: 'National ID',
    identification_number: 'ID-100',
    phone_number: '+231770000000',
    email: 'jane@example.com'
  })
  setRow(workbook.getWorksheet('Contact Persons') as Worksheet, 2, {
    merchant_reference: 'MERCHANT_001',
    name: 'John Doe',
    phone_number: '+231880000000',
    email: 'john@example.com'
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('bulk merchant workbook', () => {
  it('creates a guided workbook with dropdowns, help, and reusable reference ranges', async () => {
    const workbook = createBulkMerchantTemplate()

    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      'Instructions',
      'Merchants',
      'Locations',
      'Checkout Counters',
      'Business Owners',
      'Contact Persons',
      'Reference Data'
    ])
    expect(workbook.getWorksheet('Merchants')?.getCell('A1').text)
      .toBe('merchant_reference')
    const merchants = workbook.getWorksheet('Merchants') as Worksheet
    const locations = workbook.getWorksheet('Locations') as Worksheet
    const counters = workbook.getWorksheet('Checkout Counters') as Worksheet
    const owners = workbook.getWorksheet('Business Owners') as Worksheet
    const contacts = workbook.getWorksheet('Contact Persons') as Worksheet
    const referenceData = workbook.getWorksheet('Reference Data') as Worksheet

    expect(cellForHeader(merchants, 'employees_num').dataValidation.formulae)
      .toEqual(['BulkEmployeeCounts'])
    expect(cellForHeader(merchants, 'currency_code').dataValidation.formulae)
      .toEqual(['BulkCurrencies'])
    expect(cellForHeader(merchants, 'category_code').dataValidation.formulae)
      .toEqual(['BulkCategoryCodes'])
    expect(cellForHeader(merchants, 'mcc').dataValidation.formulae)
      .toEqual(['BulkMccCodes'])
    expect(cellForHeader(locations, 'merchant_reference').dataValidation.formulae)
      .toEqual(['BulkMerchantReferences'])
    expect(cellForHeader(locations, 'country').dataValidation.formulae)
      .toEqual(['BulkCountries'])
    expect(cellForHeader(counters, 'location_reference').dataValidation.formulae)
      .toEqual(['BulkLocationReferences'])
    expect(cellForHeader(owners, 'identification_type').dataValidation.formulae)
      .toEqual(['BulkIdentificationTypes'])
    expect(cellForHeader(contacts, 'merchant_reference').dataValidation.formulae)
      .toEqual(['BulkMerchantReferences'])
    expect(cellForHeader(locations, 'location_type', 5001).dataValidation.type)
      .toBe('list')
    expect(cellForHeader(owners, 'country').dataValidation.allowBlank).toBe(true)
    expect(merchants.getCell('A1').note).toContain('Required')
    expect(merchants.getCell('C1').note).toContain('Optional')
    expect(merchants.getCell('M1').text).toBe('category_description (automatic)')
    expect(merchants.getCell('M2').formula).toContain('VLOOKUP(H2')
    expect(merchants.getCell('N2').formula).toContain('VLOOKUP(I2')
    expect(referenceData.getColumn('J').values).toContain('Liberia')

    const serialized = Buffer.from(await workbook.xlsx.writeBuffer())
    const reloaded = new Workbook()
    await reloaded.xlsx.load(
      serialized as unknown as Parameters<typeof reloaded.xlsx.load>[0]
    )
    expect(reloaded.definedNames.getRanges('BulkCurrencies').ranges)
      .toEqual([expect.stringContaining("'Reference Data'!$A$2:$A$")])
    expect(reloaded.definedNames.getRanges('BulkMerchantReferences').ranges)
      .toEqual(['Merchants!$A$2:$A$251'])
  })

  it('parses a complete workbook and keeps the primary alias', async () => {
    const result = await parseBulkMerchantWorkbook(await validWorkbookBuffer())

    expect(result.issues).toEqual([])
    expect(result.data?.merchants).toHaveLength(1)
    expect(result.data?.merchants[0]).toMatchObject({
      merchant_reference: 'MERCHANT_001',
      payinto_alias: 'LBR-MER-0001234',
      currency_code: 'LRD',
      mcc: '5812'
    })
    expect(result.data?.checkoutCounters[0].description).toBe('Main till')
  })

  it('allows LEI to be blank', async () => {
    const buffer = await validWorkbookBuffer()
    const workbook = createBulkMerchantTemplate()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    setRow(workbook.getWorksheet('Merchants') as Worksheet, 2, { lei: '' })

    const result = await parseBulkMerchantWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer())
    )

    expect(result.issues).toEqual([])
    expect(result.data?.merchants[0].lei).toBe('')
  })

  it('returns row-level errors for broken workbook relationships', async () => {
    const buffer = await validWorkbookBuffer()
    const parsedOnce = await parseBulkMerchantWorkbook(buffer)
    expect(parsedOnce.data).toBeDefined()

    const workbook = createBulkMerchantTemplate()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    setRow(workbook.getWorksheet('Checkout Counters') as Worksheet, 2, {
      merchant_reference: 'MERCHANT_001',
      location_reference: 'UNKNOWN',
      description: 'Main till'
    })
    const result = await parseBulkMerchantWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer())
    )

    expect(result.data).toBeUndefined()
    expect(result.issues).toContainEqual(expect.objectContaining({
      sheet: 'Checkout Counters',
      row: 2,
      field: 'location_reference',
      message: 'Unknown location for this merchant'
    }))
  })

  it('rejects conflicting primary counter aliases', async () => {
    const buffer = await validWorkbookBuffer()
    const workbook = createBulkMerchantTemplate()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    setRow(workbook.getWorksheet('Checkout Counters') as Worksheet, 2, {
      alias_value: 'DIFFERENT-ALIAS'
    })

    const result = await parseBulkMerchantWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer())
    )

    expect(result.issues).toContainEqual(expect.objectContaining({
      sheet: 'Checkout Counters',
      row: 2,
      field: 'alias_value',
      message: 'The first counter alias must match payinto_alias or be blank'
    }))
  })

  it('requires unique LEIs within the workbook', async () => {
    const buffer = await validWorkbookBuffer()
    const workbook = createBulkMerchantTemplate()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    setRow(workbook.getWorksheet('Merchants') as Worksheet, 3, {
      merchant_reference: 'MERCHANT_002',
      dba_trading_name: 'Second Merchant',
      lei: 'testlei0000000000001',
      employees_num: '1 - 5',
      currency_code: 'LRD',
      category_code: '10410',
      mcc: '5812',
      merchant_type: 'Small Shop'
    })

    const result = await parseBulkMerchantWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer())
    )

    expect(result.issues).toContainEqual(expect.objectContaining({
      sheet: 'Merchants',
      row: 3,
      field: 'lei',
      message: 'LEI is duplicated; first used on row 2'
    }))
  })
})
