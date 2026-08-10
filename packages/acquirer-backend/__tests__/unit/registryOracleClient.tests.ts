import axios from 'axios'
import {
  RegistryAliasConflictError,
  isMerchantAliasAvailableInRegistry,
  registerDFSPWithRegistry,
  registerMerchantsWithRegistry
} from '../../src/services/registryOracleClient'
import logger from '../../src/services/logger'
import { AppDataSource } from '../../src/database/dataSource'
import { MerchantEntity } from '../../src/entity/MerchantEntity'
import {
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus
} from 'shared-lib'

logger.silent = true
describe('Registry Oracle HTTP client', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends authenticated merchant registration with an idempotency key', async () => {
    const request = jest.spyOn(axios, 'request').mockResolvedValue({
      data: { data: [] }
    })

    await registerMerchantsWithRegistry([], 'merchant-idempotency-key')

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/internal/v1/merchants/registrations',
      headers: expect.objectContaining({
        'x-internal-api-key': 'test-registry-internal-api-key',
        'idempotency-key': 'merchant-idempotency-key'
      })
    }))
  })

  it('reuses the same idempotency key when retrying a server failure', async () => {
    const request = jest.spyOn(axios, 'request')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500 }
      })
      .mockResolvedValueOnce({
        data: { data: { id: 1, client_secret: 'secret' } }
      })

    await registerDFSPWithRegistry({
      fspId: 'fsp1',
      dfsp_name: 'DFSP One',
      client_secret: 'secret'
    }, 'dfsp-idempotency-key')

    expect(request).toHaveBeenCalledTimes(2)
    for (const call of request.mock.calls) {
      expect(call[0].headers).toEqual(expect.objectContaining({
        'idempotency-key': 'dfsp-idempotency-key'
      }))
    }
  })

  it('surfaces Registry Oracle alias conflicts without retrying', async () => {
    const request = jest.spyOn(axios, 'request').mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: 'Alias "DUPLICATE" is already registered' }
      }
    })

    await expect(
      registerMerchantsWithRegistry([], 'duplicate-alias-key')
    ).rejects.toThrow(RegistryAliasConflictError)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('checks alias availability for a specific merchant checkout counter', async () => {
    const request = jest.spyOn(axios, 'request').mockResolvedValue({
      data: {
        data: {
          alias_value: 'LBR-MER-0001234',
          available: true
        }
      }
    })

    await expect(isMerchantAliasAvailableInRegistry(
      'LBR-MER-0001234',
      { merchantId: 42, checkoutCounterId: 84 }
    )).resolves.toBe(true)

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/internal/v1/merchant-aliases/LBR-MER-0001234/availability',
      params: {
        merchantId: 42,
        checkoutCounterId: 84
      }
    }))
  })

  it('allows a merchant after successful Registry Oracle registration', async () => {
    jest.spyOn(axios, 'request').mockResolvedValue({
      data: {
        data: [{
          merchant_id: 42,
          checkout_counter_id: 0,
          alias_value: '10000042'
        }]
      }
    })
    const merchant = new MerchantEntity()
    merchant.gleif_verified_at = new Date()
    jest.spyOn(AppDataSource.manager, 'findOne').mockResolvedValue(merchant)
    const update = jest.spyOn(AppDataSource.manager, 'update').mockResolvedValue({
      raw: [],
      affected: 1,
      generatedMaps: []
    })

    await registerMerchantsWithRegistry([], 'merchant-approval-key')

    expect(update).toHaveBeenCalledWith(
      MerchantEntity,
      42,
      expect.objectContaining({
        registration_status: MerchantRegistrationStatus.APPROVED,
        allow_block_status: MerchantAllowBlockStatus.ALLOWED
      })
    )
  })
})
