import { AppDataSource } from '../database/dataSource'
import { RegistryEntity } from '../entity/RegistryEntity'
import logger from './logger'
import { IsNull } from 'typeorm'

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
}

export async function registerMerchants (merchants: MerchantData[]): Promise<RegistryEntity[]> {
  if (merchants.length === 0) {
    logger.error('No valid merchant data is registered.')
    return []
  }

  return await AppDataSource.manager.transaction(async transactionalEntityManager => {
    const registryEntities: RegistryEntity[] = []

    for (const merchant of merchants) {
      const hasValidLEI = merchant.lei !== null &&
        merchant.lei !== undefined &&
        merchant.lei.trim() !== ''
      const aliasValue = hasValidLEI ? merchant.lei : (10000000 + merchant.merchant_id).toString()
      const aliasType = hasValidLEI ? 'LEI' : '8-digit merchant_id'
      const checkoutCounterId = merchant.checkout_counter_id ?? 0
      logger.debug('Using %s as alias_value for merchant %d: %s', aliasType, merchant.merchant_id, aliasValue)

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

      Object.assign(registryRecord, {
        merchant_id: merchant.merchant_id,
        fspId: merchant.fspId,
        dfsp_name: merchant.dfsp_name,
        checkout_counter_id: checkoutCounterId,
        alias_value: aliasValue,
        currency: merchant.currency_code.iso_code,
        lei: hasValidLEI ? merchant.lei : null
      })
      registryEntities.push(await transactionalEntityManager.save(RegistryEntity, registryRecord))
    }

    logger.debug('Registered %d merchant records', registryEntities.length)
    return registryEntities
  })
}
