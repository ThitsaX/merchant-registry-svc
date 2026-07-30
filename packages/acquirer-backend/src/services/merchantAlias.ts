import { parseMerchantAlias } from 'shared-lib'
import { AppDataSource } from '../database/dataSource'
import { CheckoutCounterEntity } from '../entity/CheckoutCounterEntity'
import { type MerchantEntity } from '../entity/MerchantEntity'

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

export async function saveRequestedMerchantAlias (
  merchant: MerchantEntity,
  value: unknown
): Promise<void> {
  if (value === undefined) return

  const alias = normalizeRequestedAlias(value)
  const repository = AppDataSource.getRepository(CheckoutCounterEntity)
  let checkoutCounter: CheckoutCounterEntity | undefined =
    merchant.checkout_counters?.[0]

  if (checkoutCounter === undefined && merchant.id !== undefined) {
    checkoutCounter = await repository.findOne({
      where: { merchant: { id: merchant.id } }
    }) ?? undefined
  }

  if (checkoutCounter === undefined) {
    if (alias === null) return
    checkoutCounter = repository.create({
      alias_value: alias,
      merchant
    })
  } else {
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
