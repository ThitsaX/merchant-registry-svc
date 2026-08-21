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
export class MerchantLeiConflictError extends Error {}

export interface MerchantLeiRegistration {
  lei: string
  merchant_id: number
  fspId: string
  dfsp_name: string
}

export interface MerchantAliasOwner {
  merchantId: number
  checkoutCounterId: number
}

function normalizeLei (value: string): string {
  return value.trim().toUpperCase()
}

export async function getMerchantLeiRegistrations (
  values: string[]
): Promise<MerchantLeiRegistration[]> {
  const leis = [...new Set(values.map(normalizeLei).filter(lei => lei.length > 0))]
  if (leis.length === 0) return []

  const records = await AppDataSource.manager
    .createQueryBuilder(RegistryEntity, 'registry')
    .select([
      'registry.lei',
      'registry.merchant_id',
      'registry.fspId',
      'registry.dfsp_name'
    ])
    .where('UPPER(TRIM(registry.lei)) IN (:...leis)', { leis })
    .getMany()

  const registrations = new Map<string, MerchantLeiRegistration>()
  for (const record of records) {
    if (record.lei === undefined || record.lei === null) continue
    const lei = normalizeLei(record.lei)
    const key = `${lei}\u0000${record.fspId}\u0000${record.merchant_id}`
    registrations.set(key, {
      lei,
      merchant_id: record.merchant_id,
      fspId: record.fspId,
      dfsp_name: record.dfsp_name
    })
  }
  return [...registrations.values()]
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
    const lei = merchant.lei === undefined ? undefined : normalizeLei(merchant.lei)
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
  const lei = merchant.lei === undefined ? undefined : normalizeLei(merchant.lei)
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
      if (preferredAlias.lei !== null) {
        const leiOwner = await transactionalEntityManager
          .createQueryBuilder(RegistryEntity, 'registry')
          .select([
            'registry.merchant_id',
            'registry.fspId',
            'registry.dfsp_name'
          ])
          .where('UPPER(TRIM(registry.lei)) = :lei', { lei: preferredAlias.lei })
          .getOne()
        if (
          leiOwner !== null &&
          (leiOwner.merchant_id !== merchant.merchant_id || leiOwner.fspId !== merchant.fspId)
        ) {
          throw new MerchantLeiConflictError(
            `LEI "${preferredAlias.lei}" is already registered with ` +
            `DFSP "${leiOwner.dfsp_name}" (${leiOwner.fspId})`
          )
        }
      }
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
