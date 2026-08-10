import { parseMerchantAlias } from 'shared-lib'
import { Not } from 'typeorm'
import { AppDataSource } from '../database/dataSource'
import { CheckoutCounterEntity } from '../entity/CheckoutCounterEntity'
import { type MerchantEntity } from '../entity/MerchantEntity'
import {
  isMerchantAliasAvailableInRegistry,
  type RegistryAliasOwner
} from './registryOracleClient'

function normalizeRequestedAlias (value: unknown): string | null {
  if (value === null || (typeof value === 'string' && value.trim().length === 0)) {
    return null
  }

  const alias = parseMerchantAlias(
    typeof value === 'string' ? value.trim() : value
  )
  if (alias === null) {
    throw new Error('Invalid merchant alias')
  }
  return alias
}

export async function isRequestedMerchantAliasAvailable (
  value: unknown,
  owner?: RegistryAliasOwner
): Promise<boolean> {
  if (value === undefined) return true

  const alias = normalizeRequestedAlias(value)
  if (alias === null) return true

  const repository = AppDataSource.getRepository(CheckoutCounterEntity)
  const localOwner = await repository.findOne({
    where: {
      alias_value: alias,
      ...(owner === undefined ? {} : { id: Not(owner.checkoutCounterId) })
    },
    select: ['id']
  })

  if (localOwner !== null) {
    return false
  }

  return await isMerchantAliasAvailableInRegistry(alias, owner)
}

export async function saveRequestedMerchantAlias (
  merchant: MerchantEntity,
  value: unknown
): Promise<void> {
  if (value === undefined) return

  const alias = normalizeRequestedAlias(value)
  const repository = AppDataSource.getRepository(CheckoutCounterEntity)
  let checkoutCounter: CheckoutCounterEntity | undefined =
    merchant.checkout_counters
      ?.filter(counter => counter.id !== undefined)
      .sort((left, right) => {
        const counterNumberDifference = left.counter_number - right.counter_number
        return counterNumberDifference !== 0
          ? counterNumberDifference
          : left.id - right.id
      })[0]

  if (checkoutCounter === undefined && merchant.id !== undefined) {
    checkoutCounter = await repository.findOne({
      where: { merchant: { id: merchant.id } },
      order: { counter_number: 'ASC', id: 'ASC' }
    }) ?? undefined
  }

  if (checkoutCounter === undefined) {
    if (alias === null) return
    checkoutCounter = repository.create({
      alias_value: alias,
      counter_number: 1,
      merchant
    })
  } else {
    checkoutCounter.counter_number = 1
    checkoutCounter.alias_value = alias
  }

  const savedCheckoutCounter = await repository.save(checkoutCounter)
  merchant.checkout_counters = [
    savedCheckoutCounter,
    ...(merchant.checkout_counters?.filter(
      existing => existing.id !== savedCheckoutCounter.id
    ) ?? [])
  ]
}
