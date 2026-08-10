/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Response } from 'express'
import {
  AuditActionType,
  AuditTrasactionStatus,
  MerchantRegistrationStatus
} from 'shared-lib'
import { AppDataSource } from '../../database/dataSource'
import { CheckoutCounterEntity } from '../../entity/CheckoutCounterEntity'
import { MerchantEntity } from '../../entity/MerchantEntity'
import { audit } from '../../utils/audit'
import logger from '../../services/logger'
import { type AuthRequest } from '../../types/express'
import { ApprovedCheckoutCounterSubmitDataSchema } from '../schemas'
import {
  CheckoutCounterAliasConflictError,
  CheckoutCounterIdempotencyConflictError,
  CheckoutCounterLimitError,
  createApprovedCheckoutCounter,
  isCheckoutCounterRegistered,
  MerchantNotApprovedError,
  registerApprovedCheckoutCounter
} from '../../services/approvedCheckoutCounters'

function checkoutCounterResponse (checkoutCounter: CheckoutCounterEntity) {
  return {
    id: checkoutCounter.id,
    counter_number: checkoutCounter.counter_number,
    description: checkoutCounter.description,
    alias_type: checkoutCounter.alias_type,
    alias_value: checkoutCounter.alias_value,
    merchant_registry_id: checkoutCounter.merchant_registry_id,
    qr_code_link: checkoutCounter.qr_code_link,
    checkout_location: checkoutCounter.checkout_location == null
      ? null
      : { id: checkoutCounter.checkout_location.id },
    registration_status: isCheckoutCounterRegistered(checkoutCounter)
      ? 'Registered'
      : 'Pending',
    created_at: checkoutCounter.created_at,
    updated_at: checkoutCounter.updated_at
  }
}

async function loadApprovedMerchant (merchantId: number): Promise<MerchantEntity | null> {
  return await AppDataSource.getRepository(MerchantEntity).findOne({
    where: { id: merchantId },
    relations: [
      'currency_code',
      'default_dfsp',
      'dfsps',
      'locations',
      'checkout_counters',
      'checkout_counters.checkout_location'
    ]
  })
}

function userCanManageMerchant (req: AuthRequest, merchant: MerchantEntity): boolean {
  const dfspId = req.user?.dfsp?.id
  return dfspId !== undefined && merchant.dfsps.some(dfsp => dfsp.id === dfspId)
}

function readIdempotencyKey (req: AuthRequest): string | null {
  const value = req.header('idempotency-key')
  return value !== undefined && value.length > 0 && value.length <= 128
    ? value
    : null
}

async function auditFailure (
  req: AuthRequest,
  message: string,
  merchantId: number
): Promise<void> {
  await audit(
    AuditActionType.ADD,
    AuditTrasactionStatus.FAILURE,
    'postApprovedCheckoutCounter',
    message,
    'CheckoutCounterEntity',
    {},
    { merchant_id: merchantId, ...req.body },
    req.user ?? null
  )
}

/** Add and immediately register a checkout counter for an approved merchant. */
export async function postApprovedCheckoutCounter (req: AuthRequest, res: Response) {
  const portalUser = req.user
  if (portalUser == null) return res.status(401).send({ message: 'Unauthorized' })

  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 1) {
    await auditFailure(req, 'Invalid merchant ID', merchantId)
    return res.status(422).send({ message: 'Invalid merchant ID' })
  }

  const validation = ApprovedCheckoutCounterSubmitDataSchema.safeParse(req.body)
  if (!validation.success) {
    const messages = validation.error.issues.map(issue => issue.message)
    await auditFailure(req, 'Checkout counter validation failed', merchantId)
    return res.status(422).send({ message: messages })
  }

  const idempotencyKey = readIdempotencyKey(req)
  if (idempotencyKey === null) {
    await auditFailure(req, 'A valid Idempotency-Key header is required', merchantId)
    return res.status(400).send({ message: 'A valid Idempotency-Key header is required' })
  }

  const merchant = await loadApprovedMerchant(merchantId)
  if (merchant === null) return res.status(404).send({ message: 'Merchant not found' })
  if (!userCanManageMerchant(req, merchant)) {
    return res.status(400).send({
      message: 'Accessing different DFSP\'s Merchant is not allowed.'
    })
  }
  if (merchant.registration_status !== MerchantRegistrationStatus.APPROVED) {
    return res.status(409).send({
      message: 'Checkout counters can only be added to an approved merchant'
    })
  }

  const location = merchant.locations.find(item => item.id === validation.data.location_id)
  if (location === undefined) {
    return res.status(422).send({ message: 'Merchant location not found' })
  }

  let createdCounter: CheckoutCounterEntity | undefined
  try {
    const created = await createApprovedCheckoutCounter(
      merchant,
      location,
      validation.data,
      idempotencyKey
    )
    createdCounter = created.checkoutCounter
    const registeredCounter = await registerApprovedCheckoutCounter(
      merchant,
      created.checkoutCounter,
      idempotencyKey
    )

    await audit(
      AuditActionType.ADD,
      AuditTrasactionStatus.SUCCESS,
      'postApprovedCheckoutCounter',
      `Checkout counter ${registeredCounter.counter_number} registered`,
      'CheckoutCounterEntity',
      {},
      checkoutCounterResponse(registeredCounter),
      portalUser
    )
    res.setHeader('Idempotency-Replayed', String(created.replayed))
    return res.status(created.replayed ? 200 : 201).send({
      message: 'Checkout counter registered',
      data: checkoutCounterResponse(registeredCounter)
    })
  } catch (error) {
    logger.error('Adding approved checkout counter failed: %o', error)
    await auditFailure(req, 'Adding approved checkout counter failed', merchantId)
    if (
      error instanceof CheckoutCounterAliasConflictError ||
      error instanceof CheckoutCounterIdempotencyConflictError
    ) {
      if (error instanceof CheckoutCounterAliasConflictError && createdCounter !== undefined) {
        await AppDataSource.getRepository(CheckoutCounterEntity).delete(createdCounter.id)
      }
      return res.status(409).send({ message: error.message })
    }
    if (error instanceof CheckoutCounterLimitError || error instanceof MerchantNotApprovedError) {
      return res.status(409).send({ message: error.message })
    }
    return res.status(502).send({
      message: 'Registry synchronization failed; the pending counter can be retried',
      counterId: createdCounter?.id
    })
  }
}

/** Retry Registry/QR synchronization for a pending approved checkout counter. */
export async function postApprovedCheckoutCounterRegistration (
  req: AuthRequest,
  res: Response
) {
  const portalUser = req.user
  if (portalUser == null) return res.status(401).send({ message: 'Unauthorized' })

  const merchantId = Number(req.params.merchantId)
  const counterId = Number(req.params.counterId)
  if (
    !Number.isInteger(merchantId) || merchantId < 1 ||
    !Number.isInteger(counterId) || counterId < 1
  ) {
    return res.status(422).send({ message: 'Invalid merchant or checkout counter ID' })
  }

  const merchant = await loadApprovedMerchant(merchantId)
  if (merchant === null) return res.status(404).send({ message: 'Merchant not found' })
  if (!userCanManageMerchant(req, merchant)) {
    return res.status(400).send({
      message: 'Accessing different DFSP\'s Merchant is not allowed.'
    })
  }
  if (merchant.registration_status !== MerchantRegistrationStatus.APPROVED) {
    return res.status(409).send({
      message: 'Checkout counters can only be registered for an approved merchant'
    })
  }

  const checkoutCounter = merchant.checkout_counters.find(counter => counter.id === counterId)
  if (checkoutCounter === undefined) {
    return res.status(404).send({ message: 'Checkout counter not found' })
  }

  try {
    const registeredCounter = await registerApprovedCheckoutCounter(
      merchant,
      checkoutCounter,
      `checkout-counter-${merchantId}-${counterId}`
    )
    await audit(
      AuditActionType.UPDATE,
      AuditTrasactionStatus.SUCCESS,
      'postApprovedCheckoutCounterRegistration',
      `Checkout counter ${registeredCounter.counter_number} registration retried`,
      'CheckoutCounterEntity',
      {},
      checkoutCounterResponse(registeredCounter),
      portalUser
    )
    return res.status(200).send({
      message: 'Checkout counter registered',
      data: checkoutCounterResponse(registeredCounter)
    })
  } catch (error) {
    logger.error('Retrying checkout counter registration failed: %o', error)
    if (error instanceof CheckoutCounterAliasConflictError) {
      return res.status(409).send({ message: error.message })
    }
    return res.status(502).send({
      message: 'Registry synchronization failed; the counter remains pending'
    })
  }
}
