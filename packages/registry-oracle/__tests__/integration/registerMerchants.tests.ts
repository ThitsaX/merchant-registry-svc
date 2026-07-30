import { RegistryEntity } from '../../src/entity/RegistryEntity'
import {
  MerchantAliasConflictError,
  type MerchantData,
  registerMerchants
} from '../../src/services/registerMerchant'
import { AppDataSource } from '../../src/database/dataSource'

export function testRegisterMerchants (): void {
  test('Registering a list of valid merchants without LEI', async () => {
    // Prepare your merchant data
    const merchants: MerchantData[] = [{
      merchant_id: 66001,
      fspId: 'fsp1',
      dfsp_name: 'DFSP #1',
      checkout_counter_id: 66101,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      }
    }, {
      merchant_id: 66002,
      fspId: 'fsp2',
      dfsp_name: 'DFSP #2',
      checkout_counter_id: 66102,
      currency_code: {
        iso_code: 'EUR',
        description: 'Euro'
      }
    }]

    // Call your function
    const result: RegistryEntity[] = await registerMerchants(merchants)

    // Assertions
    expect(result).toBeInstanceOf(Array)
    expect(result).toHaveLength(merchants.length)
    expect(result[0].alias_value).toBeDefined()
    expect(result[0].alias_value.length).toBeGreaterThan(0)
    // Should be numeric (incremental) alias
    expect(result[0].alias_value).toMatch(/^\d+$/)

    expect(result[1].alias_value).toBeDefined()
    expect(result[1].alias_value.length).toBeGreaterThan(0)
    // Should be numeric (incremental) alias
    expect(result[1].alias_value).toMatch(/^\d+$/)

    expect(result[0].alias_value).not.toEqual(result[1].alias_value)
  })

  test('Registering merchants with LEI codes uses LEI as alias_value', async () => {
    const merchants: MerchantData[] = [{
      merchant_id: 66003,
      fspId: 'fsp3',
      dfsp_name: 'DFSP #3',
      checkout_counter_id: 66103,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      },
      lei: '549300ABCDEFG12345AB'
    }, {
      merchant_id: 66004,
      fspId: 'fsp4',
      dfsp_name: 'DFSP #4',
      checkout_counter_id: 66104,
      currency_code: {
        iso_code: 'EUR',
        description: 'Euro'
      },
      lei: 'LEI123456789012345XY'
    }]

    const result: RegistryEntity[] = await registerMerchants(merchants)

    // Assertions
    expect(result).toBeInstanceOf(Array)
    expect(result).toHaveLength(merchants.length)

    // First merchant should use LEI as alias_value
    expect(result[0].alias_value).toBe('549300ABCDEFG12345AB')
    expect(result[0].lei).toBe('549300ABCDEFG12345AB')

    // Second merchant should use LEI as alias_value
    expect(result[1].alias_value).toBe('LEI123456789012345XY')
    expect(result[1].lei).toBe('LEI123456789012345XY')
  })

  test('A requested custom alias takes precedence over LEI and generated aliases', async () => {
    const [result] = await registerMerchants([{
      merchant_id: 66010,
      fspId: 'fsp10',
      dfsp_name: 'DFSP #10',
      checkout_counter_id: 66110,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      },
      lei: '549300CUSTOMTEST123AB',
      alias_value: 'LBR-MER-00012345'
    }])

    expect(result.alias_value).toBe('LBR-MER-00012345')
    expect(result.lei).toBe('549300CUSTOMTEST123AB')
  })

  test('Rejects a custom alias already owned by another merchant', async () => {
    await registerMerchants([{
      merchant_id: 66011,
      fspId: 'fsp11',
      dfsp_name: 'DFSP #11',
      checkout_counter_id: 66111,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      },
      alias_value: 'SHARED-ALIAS'
    }])

    await expect(registerMerchants([{
      merchant_id: 66012,
      fspId: 'fsp12',
      dfsp_name: 'DFSP #12',
      checkout_counter_id: 66112,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      },
      alias_value: 'SHARED-ALIAS'
    }])).rejects.toThrow(MerchantAliasConflictError)
  })

  test('Registering mixed merchants - some with LEI, some without', async () => {
    const merchants: MerchantData[] = [{
      merchant_id: 66005,
      fspId: 'fsp5',
      dfsp_name: 'DFSP #5',
      checkout_counter_id: 66105,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      },
      lei: '549300MIXEDTEST123AB'
    }, {
      merchant_id: 66006,
      fspId: 'fsp6',
      dfsp_name: 'DFSP #6',
      checkout_counter_id: 66106,
      currency_code: {
        iso_code: 'EUR',
        description: 'Euro'
      }
      // No LEI provided
    }]

    const result: RegistryEntity[] = await registerMerchants(merchants)

    // Assertions
    expect(result).toBeInstanceOf(Array)
    expect(result).toHaveLength(merchants.length)

    // First merchant should use LEI as alias_value
    expect(result[0].alias_value).toBe('549300MIXEDTEST123AB')
    expect(result[0].lei).toBe('549300MIXEDTEST123AB')

    // Second merchant should use incremental alias_value
    expect(result[1].alias_value).toMatch(/^\d+$/)
    expect(result[1].lei).toBeNull()
  })

  test('Merchants with empty or whitespace-only LEI fall back to incremental', async () => {
    const merchants: MerchantData[] = [{
      merchant_id: 66007,
      fspId: 'fsp7',
      dfsp_name: 'DFSP #7',
      checkout_counter_id: 66107,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      },
      lei: ''
    }, {
      merchant_id: 66008,
      fspId: 'fsp8',
      dfsp_name: 'DFSP #8',
      checkout_counter_id: 66108,
      currency_code: {
        iso_code: 'EUR',
        description: 'Euro'
      },
      lei: '   '
    }]

    const result: RegistryEntity[] = await registerMerchants(merchants)

    // Assertions
    expect(result).toBeInstanceOf(Array)
    expect(result).toHaveLength(merchants.length)

    // Both merchants should use incremental alias_value since LEI is empty/whitespace
    expect(result[0].alias_value).toMatch(/^\d+$/)
    expect(result[1].alias_value).toMatch(/^\d+$/)

    expect(result[0].alias_value).not.toEqual(result[1].alias_value)
  })

  test('Handling empty merchant list', async () => {
    const result = await registerMerchants([])
    expect(result).toEqual([])
  })

  test('Registering the same merchant twice updates one registry record', async () => {
    const merchant: MerchantData = {
      merchant_id: 66009,
      fspId: 'fsp9',
      dfsp_name: 'DFSP #9',
      checkout_counter_id: 66109,
      currency_code: {
        iso_code: 'USD',
        description: 'US Dollar'
      }
    }

    const firstResult = await registerMerchants([merchant])
    const secondResult = await registerMerchants([merchant])

    expect(secondResult[0].id).toBe(firstResult[0].id)
    expect(await AppDataSource.manager.countBy(RegistryEntity, {
      merchant_id: merchant.merchant_id,
      checkout_counter_id: merchant.checkout_counter_id
    })).toBe(1)
  })
}
