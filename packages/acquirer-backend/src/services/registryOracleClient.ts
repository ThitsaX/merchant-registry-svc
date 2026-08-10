/* istanbul ignore file */
import axios, { isAxiosError, type AxiosRequestConfig } from 'axios'
import 'dotenv/config'
import {
  isMerchantClassificationCode,
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus
} from 'shared-lib'
import logger from './logger'
import { readEnv } from '../setup/readEnv'
import { v4 as uuidv4 } from 'uuid'
import { AppDataSource } from '../database/dataSource'
import { CheckoutCounterEntity } from '../entity/CheckoutCounterEntity'
import { MerchantEntity } from '../entity/MerchantEntity'
import { uploadCheckoutAliasQRImage } from './S3Client'
import { generateQRImage, getEMVQRCodeText } from './generateQRImage'
import path from 'path'
import { CountryEntity } from '../entity/CountryEntity'

const REGISTRY_ORACLE_URL = readEnv('REGISTRY_ORACLE_URL', 'http://127.0.0.1:8888') as string
const REGISTRY_INTERNAL_API_KEY = readEnv('REGISTRY_INTERNAL_API_KEY', '') as string
const REGISTRY_HTTP_TIMEOUT_MS = readEnv('REGISTRY_HTTP_TIMEOUT_MS', 5000, true) as number
const REGISTRY_HTTP_RETRIES = readEnv('REGISTRY_HTTP_RETRIES', 2, true) as number
const EMVCO_MERCHANT_ACCOUNT_GUI = readEnv(
  'EMVCO_MERCHANT_ACCOUNT_GUI',
  'org.mojaloop'
) as string

export interface RegistryMerchantData {
  merchant_id: number
  fspId: string
  dfsp_name: string
  checkout_counter_id?: number
  checkout_counter_number?: number
  alias_stem?: string
  currency_code: {
    iso_code: string
    description: string
  }
  lei?: string
  alias_value?: string
}

interface RegistryAliasData {
  id?: number
  merchant_id: number
  checkout_counter_id: number
  alias_value: string
}

interface RegistryResponse<T> {
  data: T
}

interface DFSPRegistryData {
  fspId: string
  dfsp_name: string
  client_secret: string
}

export class RegistryAliasConflictError extends Error {}

export interface RegistryAliasOwner {
  merchantId: number
  checkoutCounterId: number
}

function isRetryable (error: unknown): boolean {
  if (!isAxiosError(error)) return false
  if (error.response === undefined) return true
  const status = error.response.status
  return status === 408 || status === 425 || status === 429 || status >= 500
}

async function delayRetry (attempt: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, attempt * 100))
}

async function requestRegistry<T> (
  config: AxiosRequestConfig,
  idempotencyKey: string
): Promise<T> {
  if (REGISTRY_INTERNAL_API_KEY.length === 0) {
    throw new Error('REGISTRY_INTERNAL_API_KEY is not configured')
  }
  let lastError: unknown
  for (let attempt = 1; attempt <= REGISTRY_HTTP_RETRIES + 1; attempt++) {
    try {
      const response = await axios.request<T>({
        ...config,
        baseURL: REGISTRY_ORACLE_URL,
        timeout: REGISTRY_HTTP_TIMEOUT_MS,
        headers: {
          ...config.headers,
          'content-type': 'application/json',
          'x-internal-api-key': REGISTRY_INTERNAL_API_KEY,
          'idempotency-key': idempotencyKey
        }
      })
      return response.data
    } catch (error) {
      lastError = error
      if (attempt > REGISTRY_HTTP_RETRIES || !isRetryable(error)) break
      logger.warn(
        'Registry Oracle request failed; retrying attempt %d of %d',
        attempt + 1,
        REGISTRY_HTTP_RETRIES + 1
      )
      await delayRetry(attempt)
    }
  }
  throw lastError
}

export async function registerMerchantsWithRegistry (
  merchants: RegistryMerchantData[],
  idempotencyKey: string = uuidv4()
): Promise<void> {
  let response: RegistryResponse<RegistryAliasData[]>
  try {
    response = await requestRegistry<RegistryResponse<RegistryAliasData[]>>({
      method: 'POST',
      url: '/internal/v1/merchants/registrations',
      data: { merchants }
    }, idempotencyKey)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 409) {
      const data = error.response.data as { message?: unknown } | undefined
      const message = typeof data?.message === 'string'
        ? data.message
        : 'The requested merchant alias is already registered'
      throw new RegistryAliasConflictError(message)
    }
    throw error
  }
  await processBulkGenerateAlias(response.data)
}

export async function isMerchantAliasAvailableInRegistry (
  aliasValue: string,
  owner?: RegistryAliasOwner
): Promise<boolean> {
  const response = await requestRegistry<RegistryResponse<{
    alias_value: string
    available: boolean
  }>>({
    method: 'GET',
    url: `/internal/v1/merchant-aliases/${encodeURIComponent(aliasValue)}/availability`,
    params: owner === undefined
      ? undefined
      : {
          merchantId: owner.merchantId,
          checkoutCounterId: owner.checkoutCounterId
        }
  }, uuidv4())

  return response.data.available
}

export async function registerDFSPWithRegistry (
  dfspData: DFSPRegistryData,
  idempotencyKey: string = uuidv4()
): Promise<void> {
  await requestRegistry({
    method: 'PUT',
    url: `/internal/v1/dfsps/${encodeURIComponent(dfspData.fspId)}/access-credential`,
    data: {
      dfsp_name: dfspData.dfsp_name,
      client_secret: dfspData.client_secret
    }
  }, idempotencyKey)
}

/**
 * Process aliases returned by the Registry Oracle.
 */
async function processBulkGenerateAlias (aliasDataList: RegistryAliasData[]): Promise<void> {
  for (const aliasData of aliasDataList) {
    await processAliasData(aliasData)
  }
  logger.info('Updated alias value for %d checkout counters', aliasDataList.length)
  logger.info('Updated registration status for %d merchants: Approved', aliasDataList.length)
}

/**
 * Process a single alias.
 */
async function processAliasData (aliasData: RegistryAliasData): Promise<void> {
  if (aliasData.checkout_counter_id <= 0) {
    await updateMerchantStatus(aliasData.merchant_id)
    return
  }
  const checkoutCounterReference = uuidv4().replace(/-/g, '')

  const qrImageBuffer = await generateQRImageForAlias(aliasData, checkoutCounterReference)
  if (qrImageBuffer === null || qrImageBuffer === undefined) {
    throw new Error(`QR generation failed for merchant ${aliasData.merchant_id}`)
  }

  const qrImageS3Path = await uploadQRImage(aliasData.alias_value, qrImageBuffer)
  if (qrImageS3Path === null || qrImageS3Path === undefined || qrImageS3Path === '') {
    throw new Error(`QR upload failed for merchant ${aliasData.merchant_id}`)
  }

  await updateCheckoutCounter(
    aliasData.checkout_counter_id,
    checkoutCounterReference,
    aliasData.alias_value,
    qrImageS3Path,
    aliasData.id
  )
  await updateMerchantStatus(aliasData.merchant_id)
}

async function generateQRImageForAlias (
  aliasData: RegistryAliasData,
  checkoutCounterReference: string
): Promise<Buffer | null> {
  try {
    const merchant = await fetchMerchantData(aliasData.merchant_id)
    if (merchant === null || merchant === undefined) {
      logger.error('Error while generating QR image: Merchant Not Found \'%o\'', aliasData)
      return null
    }
    if (merchant.mcc == null || !isMerchantClassificationCode(merchant.mcc)) {
      logger.error(
        'Error while generating QR image: Merchant %d does not have an approved MCC',
        merchant.id
      )
      return null
    }

    const checkoutCounter = await AppDataSource.manager.findOne(CheckoutCounterEntity, {
      where: { id: aliasData.checkout_counter_id },
      relations: ['checkout_location']
    })

    const country = await AppDataSource.manager.findOne(CountryEntity, {
      where: { name: checkoutCounter?.checkout_location.country },
      select: ['code']
    })

    const merchantCity = checkoutCounter?.checkout_location?.town_name ??
      checkoutCounter?.checkout_location?.district_name ??
      ''
    const emvcoQRString = getEMVQRCodeText({
      globallyUniqueIdentifier: EMVCO_MERCHANT_ACCOUNT_GUI,
      checkoutCounterAliasValue: aliasData.alias_value,
      checkoutCounterReference,
      merchantCategoryCode: merchant.mcc,
      transactionCurrency: merchant.currency_code.iso_code,
      countryCode: country?.code ?? '',
      merchantName: merchant.dba_trading_name.trim().slice(0, 25).trimEnd(),
      merchantCity: merchantCity.trim().slice(0, 15).trimEnd()
    })

    const frameImagePath = path.join(__dirname, '../../assets/sample-qr-frame/frame.png')
    return await generateQRImage(emvcoQRString, {}, frameImagePath)
  } catch (e) {
    logger.error('Error while generating QR image: %o', e)
    return null
  }
}

async function fetchMerchantData (merchantId: number): Promise<MerchantEntity | null> {
  const merchant = await AppDataSource.manager.findOne(MerchantEntity, {
    where: { id: merchantId },
    relations: ['currency_code']
  })
  logger.debug('Merchant: %o', merchant)
  return merchant
}

async function uploadQRImage (aliasValue: string, qrImageBuffer: Buffer): Promise<string | null> {
  const qrImageS3Path = await uploadCheckoutAliasQRImage(aliasValue, qrImageBuffer)
  if (qrImageS3Path === null || qrImageS3Path === undefined || qrImageS3Path === '') {
    logger.error('Error while uploading QR image to S3')
    return null
  }

  logger.info('Uploaded QR image to S3: %s', qrImageS3Path)
  return qrImageS3Path
}

async function updateCheckoutCounter (
  checkoutCounterId: number,
  guid: string,
  aliasValue: string,
  qrCodeLink: string,
  merchantRegistryId?: number
): Promise<void> {
  await AppDataSource.manager.update(CheckoutCounterEntity, checkoutCounterId, {
    guid,
    alias_value: aliasValue,
    qr_code_link: qrCodeLink,
    ...(merchantRegistryId === undefined
      ? {}
      : { merchant_registry_id: merchantRegistryId })
  })
}

async function updateMerchantStatus (merchantId: number): Promise<void> {
  const currentMerchant = await AppDataSource.manager.findOne(MerchantEntity, {
    where: { id: merchantId },
    select: ['gleif_verified_at']
  })

  const updateData: any = {
    registration_status: MerchantRegistrationStatus.APPROVED,
    allow_block_status: MerchantAllowBlockStatus.ALLOWED
  }

  if (shouldSetGleifVerifiedAt(currentMerchant)) {
    updateData.gleif_verified_at = new Date()
  }

  await AppDataSource.manager.update(MerchantEntity, merchantId, updateData)
}

function shouldSetGleifVerifiedAt (merchant: MerchantEntity | null): boolean {
  return merchant !== null && merchant !== undefined &&
         (merchant.gleif_verified_at === null || merchant.gleif_verified_at === undefined)
}
