import { AppDataSource } from '../database/dataSource'
import { RegistryEntity } from '../entity/RegistryEntity'
import logger from './logger'
import { IsNull } from 'typeorm'
import { buildCheckoutCounterAlias, parseMerchantAlias } from 'shared-lib'

export interface CurrencyCode {
  iso_code: string
  description: string
}

export interface MerchantData {
  merchant_id: number
  fspId: string
  dfsp_name: string
  checkout_counter_id?: number
  checkout_counter_number?: number
  alias_stem?: string
  currency_code: CurrencyCode
  lei?: string
  alias_value?: string
}

export class InvalidMerchantAliasError extends Error {}
export class MerchantAliasConflictError extends Error {}

export interface MerchantAliasOwner {
  merchantId: number
  checkoutCounterId: number
}

export async function isMerchantAliasAvailable (
  aliasValue: string,
  owner?: MerchantAliasOwner
): Promise<boolean> {
  const aliasOwner = await AppDataSource.manager
    .createQueryBuilder(RegistryEntity, 'registry')
    .select(['registry.merchant_id', 'registry.checkout_counter_id'])
    .where('LOWER(registry.alias_value) = LOWER(:aliasValue)', { aliasValue })
    .getOne()

  if (aliasOwner === null) return true

  return owner !== undefined &&
    aliasOwner.merchant_id === owner.merchantId &&
    aliasOwner.checkout_counter_id === owner.checkoutCounterId
}

function resolvePreferredAlias (merchant: MerchantData): {
  aliasValue: string
  aliasSource: string
  lei: string | null
} {
  const requestedAlias = merchant.alias_value?.trim()
  if (requestedAlias !== undefined && requestedAlias.length > 0) {
    const parsedAlias = parseMerchantAlias(requestedAlias)
    const lei = merchant.lei?.trim()
    if (parsedAlias === null) {
      throw new InvalidMerchantAliasError(
        'Alias must contain 1-32 letters, numbers, underscores, or hyphens'
      )
    }
    return {
      aliasValue: parsedAlias,
      aliasSource: 'custom alias',
      lei: lei !== undefined && lei.length > 0 ? lei : null
    }
  }

  const counterNumber = merchant.checkout_counter_number ?? 1
  const requestedStem = merchant.alias_stem?.trim()
  const lei = merchant.lei?.trim()
  const aliasStem = requestedStem !== undefined && requestedStem.length > 0
    ? requestedStem
    : (
        lei !== undefined && lei.length > 0
          ? lei
          : (10000000 + merchant.merchant_id).toString()
      )
  const aliasValue = buildCheckoutCounterAlias(aliasStem, counterNumber)
  if (aliasValue === null) {
    throw new InvalidMerchantAliasError(
      'Alias stem must contain 1-32 letters, numbers, underscores, or hyphens'
    )
  }

  return {
    aliasValue,
    aliasSource: requestedStem !== undefined && requestedStem.length > 0
      ? 'merchant alias stem'
      : (lei !== undefined && lei.length > 0 ? 'LEI' : '8-digit merchant_id'),
    lei: lei !== undefined && lei.length > 0 ? lei : null
  }
}

export async function registerMerchants (merchants: MerchantData[]): Promise<RegistryEntity[]> {
  if (merchants.length === 0) {
    logger.error('No valid merchant data is registered.')
    return []
  }

  return await AppDataSource.manager.transaction(async transactionalEntityManager => {
    const registryEntities: RegistryEntity[] = []

    for (const merchant of merchants) {
      const checkoutCounterId = merchant.checkout_counter_id ?? 0

      let registryRecord = await transactionalEntityManager.findOne(RegistryEntity, {
        where: [
          {
            merchant_id: merchant.merchant_id,
            checkout_counter_id: checkoutCounterId
          },
          ...(checkoutCounterId === 0
            ? [{
                merchant_id: merchant.merchant_id,
                checkout_counter_id: IsNull()
              }]
            : [])
        ]
      })
      if (registryRecord === null) registryRecord = new RegistryEntity()

      const preferredAlias = resolvePreferredAlias(merchant)
      const requestedAlias = merchant.alias_value?.trim()
      const hasRequestedAlias = requestedAlias !== undefined && requestedAlias.length > 0
      const aliasValue = !hasRequestedAlias && registryRecord.alias_value !== undefined
        ? registryRecord.alias_value
        : preferredAlias.aliasValue
      const aliasSource = !hasRequestedAlias && registryRecord.alias_value !== undefined
        ? 'existing registry alias'
        : preferredAlias.aliasSource

      const aliasOwner = await transactionalEntityManager
        .createQueryBuilder(RegistryEntity, 'registry')
        .select([
          'registry.id',
          'registry.merchant_id',
          'registry.checkout_counter_id'
        ])
        .where('LOWER(registry.alias_value) = LOWER(:aliasValue)', { aliasValue })
        .getOne()
      if (aliasOwner !== null && aliasOwner.id !== registryRecord.id) {
        throw new MerchantAliasConflictError(`Alias "${aliasValue}" is already registered`)
      }

      logger.debug(
        'Using %s as alias_value for merchant %d counter %d: %s',
        aliasSource,
        merchant.merchant_id,
        checkoutCounterId,
        aliasValue
      )

      Object.assign(registryRecord, {
        merchant_id: merchant.merchant_id,
        fspId: merchant.fspId,
        dfsp_name: merchant.dfsp_name,
        checkout_counter_id: checkoutCounterId,
        alias_value: aliasValue,
        currency: merchant.currency_code.iso_code,
        lei: preferredAlias.lei
      })
      registryEntities.push(await transactionalEntityManager.save(RegistryEntity, registryRecord))
    }

    logger.debug('Registered %d merchant records', registryEntities.length)
    return registryEntities
  })
}
