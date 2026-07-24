import QRCode, { type QRCodeToBufferOptions } from 'qrcode'
import sharp from 'sharp'
import fs from 'fs'
import * as currencyCodes from 'currency-codes'

const EMV_TEXT_PATTERN = /^[\x20-\x7E]+$/

export interface EMVQRCodeData {
  globallyUniqueIdentifier: string
  checkoutCounterAliasValue: string
  checkoutCounterReference?: string
  merchantCategoryCode: string
  transactionCurrency: string
  countryCode: string
  merchantName: string
  merchantCity: string
}

function assertEMVText (field: string, value: string, maxLength: number): void {
  if (value.length === 0) {
    throw new Error(`${field} is required`)
  }
  if (value.length > maxLength) {
    throw new Error(`${field} must not exceed ${maxLength} characters`)
  }
  if (!EMV_TEXT_PATTERN.test(value)) {
    throw new Error(`${field} must contain printable ASCII characters only`)
  }
}

function assertGloballyUniqueIdentifier (value: string): void {
  assertEMVText('Globally unique identifier', value, 32)
  const isAidOrUuid = /^[0-9A-F]+$/i.test(value) &&
    value.length >= 10 &&
    value.length % 2 === 0
  const isReverseDomain = /^(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i
    .test(value)
  if (!isAidOrUuid && !isReverseDomain) {
    throw new Error(
      'Globally unique identifier must be an AID, UUID without hyphens, or reverse domain name'
    )
  }
}

function addDataObject (id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) {
    throw new Error(`Invalid EMVCo data object ID: ${id}`)
  }
  assertEMVText(`EMVCo data object ${id}`, value, 99)
  return `${id}${value.length.toString().padStart(2, '0')}${value}`
}

function getNumericCurrencyCode (currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase()
  if (/^\d{3}$/.test(normalizedCurrency)) return normalizedCurrency

  const currencyRecord = currencyCodes.code(normalizedCurrency)
  if (currencyRecord === undefined) {
    throw new Error(`Unknown ISO 4217 currency code: ${currency}`)
  }
  return currencyRecord.number
}

function crc16CcittFalse (value: string): string {
  let crc = 0xFFFF
  for (const byte of Buffer.from(value, 'utf8')) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0
        ? ((crc << 1) ^ 0x1021) & 0xFFFF
        : (crc << 1) & 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export const getEMVQRCodeText = (data: EMVQRCodeData): string => {
  const globallyUniqueIdentifier = data.globallyUniqueIdentifier.trim()
  const alias = data.checkoutCounterAliasValue.trim()
  const reference = data.checkoutCounterReference?.trim()
  const merchantCategoryCode = data.merchantCategoryCode.trim()
  const transactionCurrency = getNumericCurrencyCode(data.transactionCurrency)
  const countryCode = data.countryCode.trim().toUpperCase()
  const merchantName = data.merchantName.trim()
  const merchantCity = data.merchantCity.trim()

  assertGloballyUniqueIdentifier(globallyUniqueIdentifier)
  assertEMVText('Checkout counter alias', alias, 99)
  if (reference !== undefined) assertEMVText('Checkout counter reference', reference, 99)
  if (!/^\d{4}$/.test(merchantCategoryCode)) {
    throw new Error('Merchant category code must be a four-digit ISO 18245 MCC')
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('Country code must be an ISO 3166-1 alpha-2 code')
  }
  assertEMVText('Merchant name', merchantName, 25)
  assertEMVText('Merchant city', merchantCity, 15)

  let merchantAccountInformation = addDataObject('00', globallyUniqueIdentifier)
  merchantAccountInformation += addDataObject('01', 'ALIAS')
  merchantAccountInformation += addDataObject('02', alias)
  if (reference !== undefined) {
    merchantAccountInformation += addDataObject('03', reference)
  }

  let payload = addDataObject('00', '01')
  payload += addDataObject('01', '11')
  payload += addDataObject('28', merchantAccountInformation)
  payload += addDataObject('52', merchantCategoryCode)
  payload += addDataObject('53', transactionCurrency)
  payload += addDataObject('58', countryCode)
  payload += addDataObject('59', merchantName)
  payload += addDataObject('60', merchantCity)

  payload += '6304'
  return payload + crc16CcittFalse(payload)
}

export const generateQRImage = async (
  text: string,
  options?: QRCodeToBufferOptions,
  frameImagePath = ''
): Promise<Buffer> => {
  let frameImageBuffer: Buffer = Buffer.from('')
  if (frameImagePath.length > 0) {
    // Read the frame image into a buffer
    try {
      frameImageBuffer = await fs.promises.readFile(frameImagePath)
    } catch (err) {
      throw new Error(`Frame image not found: ${frameImagePath}`)
    }
  }

  const qrCodeBuffer = await QRCode.toBuffer([{
    data: Buffer.from(text, 'utf8'),
    mode: 'byte'
  }], {
    width: 1500,
    ...options
  })

  if (frameImagePath === '') {
    return qrCodeBuffer
  }

  // Overlay the QR code onto the frame image
  const overlayedBuffer = await sharp(frameImageBuffer)
    .composite([{ input: qrCodeBuffer, gravity: 'center' }])
    .toBuffer()

  return overlayedBuffer
}
