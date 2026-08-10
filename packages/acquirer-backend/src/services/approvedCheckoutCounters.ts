import { createHash } from 'crypto'
import { buildCheckoutCounterAlias, MerchantRegistrationStatus } from 'shared-lib'
import { AppDataSource } from '../database/dataSource'
import { CheckoutCounterEntity } from '../entity/CheckoutCounterEntity'
import { MerchantEntity } from '../entity/MerchantEntity'
import { type MerchantLocationEntity } from '../entity/MerchantLocationEntity'
import { isUniqueConstraintError } from '../utils/databaseErrors'
import { isRequestedMerchantAliasAvailable } from './merchantAlias'
import {
  RegistryAliasConflictError,
  registerMerchantsWithRegistry
} from './registryOracleClient'

const MAX_CHECKOUT_COUNTERS_PER_MERCHANT = 50

export interface ApprovedCheckoutCounterInput {
  location_id: number
  description: string
  alias_value?: string
}

export interface CreatedCheckoutCounter {
  checkoutCounter: CheckoutCounterEntity
  replayed: boolean
}

export class CheckoutCounterLimitError extends Error {}
export class CheckoutCounterIdempotencyConflictError extends Error {}
export class CheckoutCounterAliasConflictError extends Error {}
export class MerchantNotApprovedError extends Error {}

function sha256 (value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeInput (merchantId: number, input: ApprovedCheckoutCounterInput): {
  input: ApprovedCheckoutCounterInput
  requestHash: string
} {
  const aliasValue = input.alias_value?.trim()
  const normalized = {
    location_id: input.location_id,
    description: input.description.trim(),
    ...(aliasValue === undefined || aliasValue.length === 0
      ? {}
      : { alias_value: aliasValue })
  }
  return {
    input: normalized,
    requestHash: sha256(JSON.stringify({ merchantId, ...normalized }))
  }
}

async function findByIdempotencyKeyHash (
  idempotencyKeyHash: string
): Promise<CheckoutCounterEntity | null> {
  return await AppDataSource.getRepository(CheckoutCounterEntity).findOne({
    where: { creation_idempotency_key_hash: idempotencyKeyHash },
    relations: ['merchant', 'checkout_location']
  })
}

function assertIdempotentRequest (
  checkoutCounter: CheckoutCounterEntity,
  merchantId: number,
  requestHash: string
): void {
  if (
    checkoutCounter.merchant?.id !== merchantId ||
    checkoutCounter.creation_request_hash !== requestHash
  ) {
    throw new CheckoutCounterIdempotencyConflictError(
      'Idempotency-Key was already used for a different request'
    )
  }
}

function resolveAliasStem (merchant: MerchantEntity): string {
  const primaryCounter = [...merchant.checkout_counters]
    .sort((left, right) => {
      const numberDifference = left.counter_number - right.counter_number
      return numberDifference !== 0 ? numberDifference : left.id - right.id
    })
    .find(counter => counter.counter_number === 1)
  const primaryAlias = primaryCounter?.alias_value?.trim()
  if (primaryAlias !== undefined && primaryAlias.length > 0) return primaryAlias

  const lei = merchant.lei?.trim()
  return lei !== undefined && lei.length > 0
    ? lei
    : (10000000 + merchant.id).toString()
}

export function isCheckoutCounterRegistered (
  checkoutCounter: CheckoutCounterEntity
): boolean {
  return checkoutCounter.guid != null && checkoutCounter.guid.length > 0 &&
    checkoutCounter.qr_code_link != null && checkoutCounter.qr_code_link.length > 0
}

export async function createApprovedCheckoutCounter (
  merchant: MerchantEntity,
  location: MerchantLocationEntity,
  submittedInput: ApprovedCheckoutCounterInput,
  idempotencyKey: string
): Promise<CreatedCheckoutCounter> {
  const { input, requestHash } = normalizeInput(merchant.id, submittedInput)
  const idempotencyKeyHash = sha256(idempotencyKey)
  const existing = await findByIdempotencyKeyHash(idempotencyKeyHash)
  if (existing !== null) {
    assertIdempotentRequest(existing, merchant.id, requestHash)
    return { checkoutCounter: existing, replayed: true }
  }

  let checkoutCounter: CheckoutCounterEntity
  try {
    checkoutCounter = await AppDataSource.transaction(async manager => {
      const merchantQuery = manager.createQueryBuilder(MerchantEntity, 'merchant')
        .where('merchant.id = :merchantId', { merchantId: merchant.id })
      if (AppDataSource.options.type !== 'sqlite') {
        merchantQuery.setLock('pessimistic_write')
      }
      const lockedMerchant = await merchantQuery.getOne()
      if (lockedMerchant === null) throw new Error('Merchant not found')
      if (lockedMerchant.registration_status !== MerchantRegistrationStatus.APPROVED) {
        throw new MerchantNotApprovedError(
          'Checkout counters can only be added to an approved merchant'
        )
      }

      const existingCounters = await manager.find(CheckoutCounterEntity, {
        where: { merchant: { id: merchant.id } }
      })
      if (existingCounters.length >= MAX_CHECKOUT_COUNTERS_PER_MERCHANT) {
        throw new CheckoutCounterLimitError(
          `A merchant cannot have more than ${MAX_CHECKOUT_COUNTERS_PER_MERCHANT} checkout counters`
        )
      }

      const counterNumber = Math.max(
        2,
        lockedMerchant.next_checkout_counter_number ?? 2,
        ...existingCounters.map(counter => counter.counter_number + 1)
      )
      const requestedAlias = input.alias_value?.trim()
      const aliasValue = requestedAlias !== undefined && requestedAlias.length > 0
        ? requestedAlias
        : buildCheckoutCounterAlias(resolveAliasStem(merchant), counterNumber)
      if (aliasValue === null) throw new Error('Unable to generate checkout counter alias')

      const newCounter = manager.create(CheckoutCounterEntity, {
        counter_number: counterNumber,
        description: input.description,
        alias_value: aliasValue,
        merchant: lockedMerchant,
        checkout_location: location,
        creation_idempotency_key_hash: idempotencyKeyHash,
        creation_request_hash: requestHash
      })
      const savedCounter = await manager.save(CheckoutCounterEntity, newCounter)
      await manager.update(MerchantEntity, merchant.id, {
        next_checkout_counter_number: counterNumber + 1
      })
      return savedCounter
    })
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    const concurrentCounter = await findByIdempotencyKeyHash(idempotencyKeyHash)
    if (concurrentCounter === null) throw error
    assertIdempotentRequest(concurrentCounter, merchant.id, requestHash)
    return { checkoutCounter: concurrentCounter, replayed: true }
  }

  const available = await isRequestedMerchantAliasAvailable(
    checkoutCounter.alias_value,
    { merchantId: merchant.id, checkoutCounterId: checkoutCounter.id }
  )
  if (!available) {
    await AppDataSource.getRepository(CheckoutCounterEntity).delete(checkoutCounter.id)
    throw new CheckoutCounterAliasConflictError(
      `Alias "${checkoutCounter.alias_value}" is already registered`
    )
  }

  return { checkoutCounter, replayed: false }
}

export async function registerApprovedCheckoutCounter (
  merchant: MerchantEntity,
  checkoutCounter: CheckoutCounterEntity,
  idempotencyKey: string
): Promise<CheckoutCounterEntity> {
  if (isCheckoutCounterRegistered(checkoutCounter)) return checkoutCounter

  const dfsp = merchant.default_dfsp ?? merchant.dfsps[0]
  if (dfsp === undefined) throw new Error('Merchant is missing its default DFSP')
  const aliasStem = resolveAliasStem(merchant)

  try {
    await registerMerchantsWithRegistry([{
      merchant_id: merchant.id,
      dfsp_name: dfsp.name,
      fspId: dfsp.fspId,
      checkout_counter_id: checkoutCounter.id,
      checkout_counter_number: checkoutCounter.counter_number,
      alias_stem: aliasStem,
      currency_code: merchant.currency_code,
      lei: merchant.lei ?? undefined,
      alias_value: checkoutCounter.alias_value ?? undefined
    }], sha256(idempotencyKey))
  } catch (error) {
    if (error instanceof RegistryAliasConflictError) {
      throw new CheckoutCounterAliasConflictError(error.message)
    }
    throw error
  }

  return await AppDataSource.getRepository(CheckoutCounterEntity).findOneOrFail({
    where: { id: checkoutCounter.id },
    relations: ['checkout_location']
  })
}
