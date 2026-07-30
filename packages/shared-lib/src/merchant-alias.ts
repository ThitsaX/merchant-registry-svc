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
