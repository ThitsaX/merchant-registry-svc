import { AppDataSource } from '../database/dataSource'
import { RegistryEntity } from '../entity/RegistryEntity'
import logger from './logger'
import { IsNull } from 'typeorm'
import { parseMerchantAlias } from 'shared-lib'

export interface CurrencyCode {
  iso_code: string
  description: string
}

export interface MerchantData {
  merchant_id: number
  fspId: string
  dfsp_name: string
  checkout_counter_id?: number
  currency_code: CurrencyCode
  lei?: string
  alias_value?: string
}

export class InvalidMerchantAliasError extends Error {}
export class MerchantAliasConflictError extends Error {}

function resolveAlias (merchant: MerchantData): {
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

  const lei = merchant.lei?.trim()
  if (lei !== undefined && lei.length > 0) {
    return {
      aliasValue: lei,
      aliasSource: 'LEI',
      lei
    }
  }

  return {
    aliasValue: (10000000 + merchant.merchant_id).toString(),
    aliasSource: '8-digit merchant_id',
    lei: null
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
      const { aliasValue, aliasSource, lei } = resolveAlias(merchant)
      const checkoutCounterId = merchant.checkout_counter_id ?? 0
      logger.debug(
        'Using %s as alias_value for merchant %d: %s',
        aliasSource,
        merchant.merchant_id,
        aliasValue
      )

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

      const aliasOwner = await transactionalEntityManager.findOne(RegistryEntity, {
        where: { alias_value: aliasValue },
        select: ['id', 'merchant_id', 'checkout_counter_id']
      })
      if (aliasOwner !== null && aliasOwner.id !== registryRecord.id) {
        throw new MerchantAliasConflictError(`Alias "${aliasValue}" is already registered`)
      }

      Object.assign(registryRecord, {
        merchant_id: merchant.merchant_id,
        fspId: merchant.fspId,
        dfsp_name: merchant.dfsp_name,
        checkout_counter_id: checkoutCounterId,
        alias_value: aliasValue,
        currency: merchant.currency_code.iso_code,
        lei
      })
      registryEntities.push(await transactionalEntityManager.save(RegistryEntity, registryRecord))
    }

    logger.debug('Registered %d merchant records', registryEntities.length)
    return registryEntities
  })
}
