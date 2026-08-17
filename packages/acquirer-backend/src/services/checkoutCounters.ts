import { type EntityManager } from 'typeorm'
import { CheckoutCounterEntity } from '../entity/CheckoutCounterEntity'
import { MerchantEntity } from '../entity/MerchantEntity'
import { type MerchantLocationEntity } from '../entity/MerchantLocationEntity'
import { isRequestedMerchantAliasAvailable } from './merchantAlias'

export interface CheckoutCounterInput {
  id?: number
  description: string
  alias_value?: string
}

export class InvalidCheckoutCounterError extends Error {}

export class CheckoutCounterAliasConflictError extends Error {
  constructor (
    public readonly counterIndex: number,
    public readonly alias: string,
    message = `Checkout counter alias "${alias}" is already registered`
  ) {
    super(message)
  }
}

export class CheckoutCounterAliasAvailabilityError extends Error {
  constructor (public readonly counterIndex: number) {
    super('Unable to verify checkout counter alias availability. Please try again.')
  }
}

function locationIdOf (counter: CheckoutCounterEntity): number | undefined {
  return counter.checkout_location?.id
}

function isIssued (counter: CheckoutCounterEntity): boolean {
  return (counter.guid != null && counter.guid.length > 0) ||
    (counter.qr_code_link != null && counter.qr_code_link.length > 0) ||
    (counter.merchant_registry_id != null && counter.merchant_registry_id > 0)
}

function compareCounters (
  left: CheckoutCounterEntity,
  right: CheckoutCounterEntity
): number {
  const counterNumberDifference = left.counter_number - right.counter_number
  return counterNumberDifference !== 0
    ? counterNumberDifference
    : left.id - right.id
}

function resolveExistingCounters (
  merchant: MerchantEntity,
  locationId: number | undefined,
  inputs: CheckoutCounterInput[]
): Array<CheckoutCounterEntity | undefined> {
  const availableCounters = [...(merchant.checkout_counters ?? [])]
    .sort(compareCounters)
    .filter(counter => {
      const counterLocationId = locationIdOf(counter)
      return counterLocationId === undefined || counterLocationId === locationId
    })
  const availableById = new Map(
    availableCounters.map(counter => [counter.id, counter])
  )
  const usedIds = new Set<number>()

  return inputs.map(input => {
    const counter = input.id === undefined
      ? availableCounters.find(existing =>
        !usedIds.has(existing.id) && locationIdOf(existing) === undefined
      )
      : availableById.get(input.id)
    if (counter?.id !== undefined) usedIds.add(counter.id)
    return counter
  })
}

/**
 * Check every supplied counter alias against the request, local database, and
 * Registry Oracle before the location transaction writes anything.
 */
export async function validateCheckoutCounterAliases (
  merchant: MerchantEntity,
  locationId: number | undefined,
  inputs: CheckoutCounterInput[]
): Promise<void> {
  const existingCounters = resolveExistingCounters(merchant, locationId, inputs)
  const seenAliases = new Map<string, number>()
  const requestedAliases: Array<{
    alias: string
    counterIndex: number
    counter?: CheckoutCounterEntity
  }> = []

  inputs.forEach((input, counterIndex) => {
    const alias = input.alias_value?.trim() ?? ''
    const existingCounter = existingCounters[counterIndex]
    if (alias.length === 0) return

    const normalizedAlias = alias.toLowerCase()
    const existingIndex = seenAliases.get(normalizedAlias)
    if (existingIndex !== undefined) {
      throw new CheckoutCounterAliasConflictError(
        counterIndex,
        alias,
        `Checkout counter alias "${alias}" is entered more than once`
      )
    }
    seenAliases.set(normalizedAlias, counterIndex)
    requestedAliases.push({
      alias,
      counterIndex,
      counter: existingCounter
    })
  })

  const availability = await Promise.all(requestedAliases.map(async requested => {
    try {
      const counter = requested.counter
      return await isRequestedMerchantAliasAvailable(
        requested.alias,
        counter?.id === undefined
          ? undefined
          : {
              merchantId: merchant.id,
              checkoutCounterId: counter.id
            }
      )
    } catch {
      throw new CheckoutCounterAliasAvailabilityError(requested.counterIndex)
    }
  }))

  const conflictIndex = availability.findIndex(available => !available)
  if (conflictIndex >= 0) {
    const conflict = requestedAliases[conflictIndex]
    throw new CheckoutCounterAliasConflictError(
      conflict.counterIndex,
      conflict.alias
    )
  }
}

/**
 * Replace the checkout counters assigned to one merchant location.
 *
 * An unassigned counter created during the business-information step is reused
 * first so an existing custom alias is preserved. Counters assigned to another
 * location are never changed.
 */
export async function syncCheckoutCounters (
  manager: EntityManager,
  merchant: MerchantEntity,
  location: MerchantLocationEntity,
  inputs: CheckoutCounterInput[]
): Promise<CheckoutCounterEntity[]> {
  const existingCounters = [...(merchant.checkout_counters ?? [])]
    .sort(compareCounters)
  const availableCounters = existingCounters.filter(counter => {
    const locationId = locationIdOf(counter)
    return locationId === undefined || locationId === location.id
  })
  const availableById = new Map(
    availableCounters.map(counter => [counter.id, counter])
  )
  const usedIds = new Set<number>()
  const savedCounters: CheckoutCounterEntity[] = []
  let hasPrimaryCounter = existingCounters.some(counter => counter.counter_number === 1)
  const persistedNextCounterNumber = merchant.next_checkout_counter_number ?? 2
  let nextCounterNumber = Math.max(
    2,
    persistedNextCounterNumber,
    ...existingCounters.map(counter => counter.counter_number + 1)
  )

  for (const input of inputs) {
    let counter: CheckoutCounterEntity | undefined

    if (input.id !== undefined) {
      counter = availableById.get(input.id)
      if (counter === undefined) {
        throw new InvalidCheckoutCounterError(
          `Checkout counter ${input.id} does not belong to this merchant location`
        )
      }
    } else {
      counter = availableCounters.find(existing =>
        !usedIds.has(existing.id) && locationIdOf(existing) === undefined
      )
    }

    if (counter === undefined) {
      const counterNumber = hasPrimaryCounter ? nextCounterNumber++ : 1
      counter = manager.create(CheckoutCounterEntity, {
        counter_number: counterNumber
      })
      hasPrimaryCounter = true
    } else if (usedIds.has(counter.id)) {
      throw new InvalidCheckoutCounterError(
        `Checkout counter ${counter.id} was submitted more than once`
      )
    }

    counter.description = input.description.trim()
    if (input.alias_value !== undefined) {
      const alias = input.alias_value.trim()
      const nextAlias = alias.length > 0 ? alias : null
      if (isIssued(counter) && nextAlias !== counter.alias_value) {
        throw new InvalidCheckoutCounterError(
          `Checkout counter ${counter.counter_number} has an issued alias and cannot be renamed`
        )
      }
      counter.alias_value = nextAlias
    }
    counter.merchant = merchant
    counter.checkout_location = location

    const savedCounter = await manager.save(CheckoutCounterEntity, counter)
    savedCounters.push(savedCounter)
    usedIds.add(savedCounter.id)
  }

  const removedCounters = availableCounters.filter(counter =>
    counter.id !== undefined && !usedIds.has(counter.id)
  )
  if (removedCounters.length > 0) {
    if (removedCounters.some(counter => counter.counter_number === 1)) {
      throw new InvalidCheckoutCounterError(
        'The primary checkout counter cannot be removed'
      )
    }
    const issuedCounter = removedCounters.find(isIssued)
    if (issuedCounter !== undefined) {
      throw new InvalidCheckoutCounterError(
        `Checkout counter ${issuedCounter.counter_number} has an issued alias and cannot be removed`
      )
    }
    await manager.remove(CheckoutCounterEntity, removedCounters)
  }

  if (nextCounterNumber !== persistedNextCounterNumber) {
    merchant.next_checkout_counter_number = nextCounterNumber
    await manager.update(MerchantEntity, merchant.id, {
      next_checkout_counter_number: nextCounterNumber
    })
  }

  return savedCounters.sort(compareCounters)
}
