export const MERCHANT_ALIAS_MAX_LENGTH = 32
export const MERCHANT_ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/

export function parseMerchantAlias(value: unknown): string | null {
  const alias = typeof value === 'number' && Number.isFinite(value)
    ? value.toString()
    : value

  if (
    typeof alias !== 'string' ||
    alias.length === 0 ||
    alias.length > MERCHANT_ALIAS_MAX_LENGTH ||
    !MERCHANT_ALIAS_PATTERN.test(alias)
  ) {
    return null
  }

  return alias
}

export function buildCheckoutCounterAlias(
  aliasStem: unknown,
  counterNumber: number
): string | null {
  const parsedAliasStem = parseMerchantAlias(aliasStem)
  if (
    parsedAliasStem === null ||
    !Number.isInteger(counterNumber) ||
    counterNumber < 1
  ) {
    return null
  }

  if (counterNumber === 1) return parsedAliasStem

  const suffix = `-${counterNumber.toString().padStart(2, '0')}`
  return `${parsedAliasStem.slice(0, MERCHANT_ALIAS_MAX_LENGTH - suffix.length)}${suffix}`
}
