import { type CurrencyCodes } from 'shared-lib'
import { CurrencyEntity } from '../entity/CurrencyEntity'
import { type MerchantEntity } from '../entity/MerchantEntity'

interface MerchantCurrencyInput {
  currency_code?: CurrencyCodes
  currency_codes?: CurrencyCodes[] | CurrencyCodes
}

export function getMerchantCurrencyCodes (input: MerchantCurrencyInput): CurrencyCodes[] {
  const submitted = input.currency_codes ?? input.currency_code
  const currencyCodes = Array.isArray(submitted) ? submitted : [submitted]
  return [...new Set(currencyCodes.filter(
    (currencyCode): currencyCode is CurrencyCodes => currencyCode !== undefined
  ))]
}

export function assignMerchantCurrencies (
  merchant: MerchantEntity,
  input: MerchantCurrencyInput
): void {
  const currencyCodes = getMerchantCurrencyCodes(input)
  merchant.currency_code = currencyCodes[0] as unknown as CurrencyEntity
  merchant.currencies = currencyCodes.map(isoCode => {
    const currency = new CurrencyEntity()
    currency.iso_code = isoCode
    return currency
  })
}
