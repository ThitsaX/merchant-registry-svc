import {
  isMerchantCategoryCode,
  MerchantClassificationCodes,
  isMerchantClassificationCode
} from 'shared-lib'
import { MerchantSubmitDataSchema } from '../../src/routes/schemas'

describe('Merchant MCC validation', () => {
  it('recognizes supported four-digit MCC values', () => {
    expect(MerchantClassificationCodes['5812']).toBe('Eating places and restaurants')
    expect(isMerchantClassificationCode('5812')).toBe(true)
    expect(isMerchantClassificationCode('1234')).toBe(false)
  })

  it('recognizes supported business activity codes', () => {
    expect(isMerchantCategoryCode('01120')).toBe(true)
    expect(isMerchantCategoryCode('invalid')).toBe(false)
  })

  it('accepts a supported MCC on a merchant draft', () => {
    const result = MerchantSubmitDataSchema.safeParse({ mcc: '5812' })

    expect(result.success).toBe(true)
  })

  it('rejects an unsupported four-digit MCC', () => {
    const result = MerchantSubmitDataSchema.safeParse({ mcc: '1234' })

    expect(result.success).toBe(false)
  })

  it('allows MCC to be omitted while saving an incomplete draft', () => {
    const result = MerchantSubmitDataSchema.safeParse({})

    expect(result.success).toBe(true)
  })
})
