import axios from 'axios'
import {
  registerDFSPWithRegistry,
  registerMerchantsWithRegistry
} from '../../src/services/registryOracleClient'
import logger from '../../src/services/logger'

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
})
