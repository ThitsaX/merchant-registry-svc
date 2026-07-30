import path from 'path'
import QRCode from 'qrcode'
import {
  generateQRImage,
  getEMVQRCodeText,
  type EMVQRCodeData
} from '../../src/services/generateQRImage'
import logger from '../../src/services/logger'

logger.silent = true

const validEMVQRCodeData: EMVQRCodeData = {
  globallyUniqueIdentifier: 'org.mojaloop',
  checkoutCounterAliasValue: '10000001',
  checkoutCounterReference: '581b314e257f41bfbbdc6384daa31d16',
  merchantCategoryCode: '0000',
  transactionCurrency: 'USD',
  countryCode: 'us',
  merchantName: 'ABC Hammers',
  merchantCity: 'New York'
}

describe('getEMVQRCodeText', () => {
  it('generates an EMVCo static merchant payload with numeric currency and CRC', () => {
    expect(getEMVQRCodeText(validEMVQRCodeData)).toBe(
      '00020101021128730012org.mojaloop0105ALIAS020810000001' +
      '0332581b314e257f41bfbbdc6384daa31d16520400005303840' +
      '5802US5911ABC Hammers6008New York63043660'
    )
  })

  it('generates a dynamic payload with amount and transaction reference', () => {
    const payload = getEMVQRCodeText({
      ...validEMVQRCodeData,
      transactionAmount: '12.50',
      transactionReference: 'ORDER-2026-00042'
    })

    expect(payload).toMatch(/^000201010212/)
    expect(payload).toContain('540512.50')
    expect(payload).toContain('62200516ORDER-2026-00042')
    expect(payload).toMatch(/6304[0-9A-F]{4}$/)
  })

  it.each([
    [{ transactionAmount: '12.50' }, 'Transaction amount and reference are both required'],
    [{ transactionReference: 'ORDER-42' }, 'Transaction amount and reference are both required'],
    [
      { transactionAmount: '0', transactionReference: 'ORDER-42' },
      'Transaction amount must be a positive decimal'
    ],
    [
      { transactionAmount: '01.00', transactionReference: 'ORDER-42' },
      'Transaction amount must be a positive decimal'
    ],
    [
      { transactionAmount: '1.00', transactionReference: 'R'.repeat(26) },
      'Transaction reference must not exceed 25 characters'
    ],
    [
      {
        transactionAmount: '1.001',
        transactionReference: 'ORDER-42',
        transactionCurrency: 'PHP'
      },
      'Transaction amount must use at most 2 decimal places for PHP'
    ],
    [
      {
        transactionAmount: '1.00',
        transactionReference: 'ORDER-42',
        transactionCurrency: 'JPY'
      },
      'Transaction amount must use at most 0 decimal places for JPY'
    ]
  ])('rejects invalid dynamic QR data %#', (override, expectedMessage) => {
    expect(() => getEMVQRCodeText({
      ...validEMVQRCodeData,
      ...override
    })).toThrow(expectedMessage)
  })

  it.each([
    ['globally unique identifier', { globallyUniqueIdentifier: 'random value' }],
    ['merchant category code', { merchantCategoryCode: '10120' }],
    ['country code', { countryCode: '' }],
    ['merchant name', { merchantName: 'A'.repeat(26) }],
    ['merchant city', { merchantCity: 'Mandalay, Myanmar' }],
    ['currency code', { transactionCurrency: 'NOT_A_CURRENCY' }],
    ['printable ASCII', { merchantName: 'ร้านค้า' }]
  ])('rejects an invalid %s', (_field, override) => {
    expect(() => getEMVQRCodeText({
      ...validEMVQRCodeData,
      ...override
    })).toThrow()
  })
})

describe('generateQRImage', () => {
  const sampleText = 'Hello, QR!'
  const qrOptions = { width: 128 }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('encodes the payload in QR byte mode as required by EMVCo', async () => {
    const toBuffer = jest.spyOn(QRCode, 'toBuffer')

    await generateQRImage(sampleText, qrOptions)

    expect(toBuffer).toHaveBeenCalledWith([
      { data: Buffer.from(sampleText, 'utf8'), mode: 'byte' }
    ], expect.objectContaining(qrOptions))
  })

  it('should generate a QR code without a frame', async () => {
    const result = await generateQRImage(sampleText, qrOptions)
    expect(result).toBeInstanceOf(Buffer)
  })

  it('should generate a QR code with a frame', async () => {
    const frameImagePath = path.join(__dirname, '../test-files/frame.svg')

    const result = await generateQRImage(sampleText, qrOptions, frameImagePath)
    expect(result).toBeInstanceOf(Buffer)
  })

  it('should throw an error if frame image path is invalid', async () => {
    const invalidFrameImagePath = './invalid-path.png'

    await expect(generateQRImage(sampleText, qrOptions, invalidFrameImagePath))
      .rejects
      .toThrow(`Frame image not found: ${invalidFrameImagePath}`)
  })
})
