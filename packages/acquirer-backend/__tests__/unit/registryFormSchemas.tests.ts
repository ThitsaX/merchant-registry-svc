import { BusinessOwnerIDType } from 'shared-lib'
import {
  BusinessOwnerSubmitDataSchema,
  MerchantLocationSubmitDataSchema,
  MerchantSubmitDataSchema
} from '../../src/routes/schemas'

describe('merchant registry form schemas', () => {
  it('accepts multiple merchant currencies from multipart form values', () => {
    const result = MerchantSubmitDataSchema.parse({
      currency_codes: ['USD', 'LRD']
    })

    expect(result.currency_codes).toEqual(['USD', 'LRD'])
  })

  it('normalizes one submitted currency into an array', () => {
    const result = MerchantSubmitDataSchema.parse({ currency_codes: 'USD' })

    expect(result.currency_codes).toEqual(['USD'])
  })

  it('keeps the legacy primary-currency field valid', () => {
    expect(MerchantSubmitDataSchema.safeParse({ currency_code: 'LRD' }).success).toBe(true)
  })

  it('accepts city and clan on a merchant location', () => {
    const result = MerchantLocationSubmitDataSchema.parse({
      country: 'Liberia',
      city_name: 'Monrovia',
      district_name: 'Greater Monrovia',
      town_name: 'Paynesville',
      street_name: 'Broad Street',
      clan_name: 'Vai'
    })

    expect(result).toEqual(expect.objectContaining({
      city_name: 'Monrovia',
      clan_name: 'Vai'
    }))
  })

  it('accepts Driver License as an owner ID type', () => {
    const result = BusinessOwnerSubmitDataSchema.parse({
      identificaton_type: BusinessOwnerIDType.DRIVER_LICENSE
    })

    expect(result.identificaton_type).toBe('Driver License')
  })
})
