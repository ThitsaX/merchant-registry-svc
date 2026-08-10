/* eslint-disable @typescript-eslint/no-misused-promises */
import express, { type Request, type Response } from 'express'
import { authenticateInternal } from '../middleware/authenticateInternal'
import {
  IdempotencyConflictError,
  executeIdempotently
} from '../services/idempotency'
import {
  type MerchantData,
  InvalidMerchantAliasError,
  isMerchantAliasAvailable,
  MerchantAliasConflictError,
  registerMerchants
} from '../services/registerMerchant'
import { registerEndpointDFSP } from '../services/registerEndpointDFSP'
import logger from '../services/logger'
import { parseMerchantAlias } from 'shared-lib'

const router = express.Router()

router.use('/internal/v1', authenticateInternal)

function readAliasOwner (req: Request, res: Response): {
  merchantId: number
  checkoutCounterId: number
} | null | undefined {
  const merchantIdValue = req.query.merchantId
  const checkoutCounterIdValue = req.query.checkoutCounterId

  if (merchantIdValue === undefined && checkoutCounterIdValue === undefined) return undefined
  if (typeof merchantIdValue !== 'string' || typeof checkoutCounterIdValue !== 'string') {
    res.status(400).send({
      message: 'merchantId and checkoutCounterId must be provided together'
    })
    return null
  }

  const merchantId = Number(merchantIdValue)
  const checkoutCounterId = Number(checkoutCounterIdValue)
  if (
    !Number.isInteger(merchantId) || merchantId < 1 ||
    !Number.isInteger(checkoutCounterId) || checkoutCounterId < 1
  ) {
    res.status(400).send({
      message: 'merchantId and checkoutCounterId must be positive integers'
    })
    return null
  }

  return { merchantId, checkoutCounterId }
}

function readIdempotencyKey (req: Request, res: Response): string | undefined {
  const idempotencyKey = req.header('idempotency-key')
  if (idempotencyKey === undefined || idempotencyKey.length === 0 || idempotencyKey.length > 128) {
    res.status(400).send({ message: 'A valid Idempotency-Key header is required' })
    return undefined
  }
  return idempotencyKey
}

function isMerchantData (value: unknown): value is MerchantData {
  if (value === null || typeof value !== 'object') return false
  const merchant = value as Partial<MerchantData>
  return Number.isInteger(merchant.merchant_id) &&
    (merchant.checkout_counter_id === undefined || Number.isInteger(merchant.checkout_counter_id)) &&
    (merchant.checkout_counter_number === undefined ||
      (Number.isInteger(merchant.checkout_counter_number) && merchant.checkout_counter_number > 0)) &&
    typeof merchant.fspId === 'string' &&
    merchant.fspId.length > 0 &&
    typeof merchant.dfsp_name === 'string' &&
    merchant.dfsp_name.length > 0 &&
    merchant.currency_code !== null &&
    typeof merchant.currency_code === 'object' &&
    typeof merchant.currency_code.iso_code === 'string' &&
    merchant.currency_code.iso_code.length > 0 &&
    (merchant.lei === undefined || typeof merchant.lei === 'string') &&
    (
      merchant.alias_stem === undefined ||
      (
        typeof merchant.alias_stem === 'string' &&
        parseMerchantAlias(merchant.alias_stem.trim()) !== null
      )
    ) &&
    (
      merchant.alias_value === undefined ||
      (
        typeof merchant.alias_value === 'string' &&
        parseMerchantAlias(merchant.alias_value.trim()) !== null
      )
    )
}

function handleError (error: unknown, res: Response): void {
  if (error instanceof IdempotencyConflictError) {
    res.status(409).send({ message: error.message })
    return
  }
  if (error instanceof MerchantAliasConflictError) {
    res.status(409).send({ message: error.message })
    return
  }
  if (error instanceof InvalidMerchantAliasError) {
    res.status(400).send({ message: error.message })
    return
  }
  logger.error('Internal API request failed: %o', error)
  res.status(500).send({ message: 'Internal Server Error' })
}

router.post('/internal/v1/merchants/registrations', async (req: Request, res: Response) => {
  const idempotencyKey = readIdempotencyKey(req, res)
  if (idempotencyKey === undefined) return

  const requestBody = req.body as unknown
  const merchants = requestBody !== null && typeof requestBody === 'object'
    ? (requestBody as { merchants?: unknown }).merchants
    : undefined
  if (!Array.isArray(merchants) || merchants.length === 0 || !merchants.every(isMerchantData)) {
    res.status(400).send({ message: 'merchants must be a non-empty array of valid merchant records' })
    return
  }

  try {
    const result = await executeIdempotently(
      idempotencyKey,
      'merchant-registrations',
      { merchants },
      200,
      async () => await registerMerchants(merchants)
    )
    res.setHeader('Idempotency-Replayed', String(result.replayed))
    res.status(result.statusCode).send({ data: result.data })
  } catch (error) {
    handleError(error, res)
  }
})

router.get('/internal/v1/merchant-aliases/:aliasValue/availability', async (req: Request, res: Response) => {
  const aliasValue = parseMerchantAlias(req.params.aliasValue.trim())
  if (aliasValue === null) {
    res.status(400).send({ message: 'A valid merchant alias is required' })
    return
  }

  const owner = readAliasOwner(req, res)
  if (owner === null) return

  try {
    const available = await isMerchantAliasAvailable(aliasValue, owner)
    res.status(200).send({
      data: {
        alias_value: aliasValue,
        available
      }
    })
  } catch (error) {
    handleError(error, res)
  }
})

router.put('/internal/v1/dfsps/:fspId/access-credential', async (req: Request, res: Response) => {
  const idempotencyKey = readIdempotencyKey(req, res)
  if (idempotencyKey === undefined) return

  const fspId = req.params.fspId
  const requestBody = req.body as unknown
  const dfspName = requestBody !== null && typeof requestBody === 'object'
    ? (requestBody as { dfsp_name?: unknown }).dfsp_name
    : undefined
  const clientSecret = requestBody !== null && typeof requestBody === 'object'
    ? (requestBody as { client_secret?: unknown }).client_secret
    : undefined

  if (fspId.length === 0 || typeof dfspName !== 'string' || dfspName.length === 0 ||
      typeof clientSecret !== 'string' || clientSecret.length === 0) {
    res.status(400).send({ message: 'fspId, dfsp_name and client_secret are required' })
    return
  }

  const payload = { fspId, dfsp_name: dfspName, client_secret: clientSecret }
  try {
    const result = await executeIdempotently(
      idempotencyKey,
      'dfsp-access-credential',
      payload,
      200,
      async () => await registerEndpointDFSP(payload)
    )
    res.setHeader('Idempotency-Replayed', String(result.replayed))
    res.status(result.statusCode).send({
      data: {
        id: result.data.id,
        client_secret: result.data.client_secret
      }
    })
  } catch (error) {
    handleError(error, res)
  }
})

export default router
