import { APIAccessEntity } from '../../src/entity/APIAccessEntity'
import { registerEndpointDFSP } from '../../src/services/registerEndpointDFSP'
import { AppDataSource } from '../../src/database/dataSource'

export function testRegisterDFSPEndpoint (): void {
  test('Successful DFSP registration', async () => {
    const dfspData = {
      fspId: 'testFspId',
      dfsp_name: 'Test DFSP',
      client_secret: 'random-secret-key'
    }

    const result = await registerEndpointDFSP(dfspData)

    expect(result).toBeInstanceOf(APIAccessEntity)
    expect(result.client_secret).toBe(dfspData.client_secret)

    const replayResult = await registerEndpointDFSP(dfspData)
    expect(replayResult.id).toBe(result.id)
    expect(await AppDataSource.manager.countBy(APIAccessEntity, {
      client_secret: dfspData.client_secret
    })).toBe(1)
  })
}
