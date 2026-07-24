import { AppDataSource } from '../database/dataSource'
import { DFSPEntity } from '../entity/DFSPEntity'
import { APIAccessEntity } from '../entity/APIAccessEntity'

import logger from './logger'

export interface DFSPData {
  fspId: string
  dfsp_name: string
  client_secret: string
}

export async function registerEndpointDFSP (dfspData: DFSPData): Promise<APIAccessEntity> {
  logger.debug('Registering DFSP: %o', dfspData)

  const apiAccess = await AppDataSource.manager.transaction(async transactionalEntityManager => {
    let dfsp = await transactionalEntityManager.findOne(DFSPEntity, {
      where: { fspId: dfspData.fspId }
    })
    if (dfsp === null) dfsp = new DFSPEntity()

    dfsp.fspId = dfspData.fspId
    dfsp.dfsp_name = dfspData.dfsp_name
    dfsp = await transactionalEntityManager.save(DFSPEntity, dfsp)

    const existingAccess = await transactionalEntityManager.findOne(APIAccessEntity, {
      where: { client_secret: dfspData.client_secret },
      relations: ['dfsp']
    })
    if (existingAccess !== null) {
      if (existingAccess.dfsp.fspId !== dfspData.fspId) {
        throw new Error('Client secret is already assigned to another DFSP')
      }
      return existingAccess
    }

    const newAccess = new APIAccessEntity()
    newAccess.client_secret = dfspData.client_secret
    newAccess.dfsp = dfsp
    return await transactionalEntityManager.save(APIAccessEntity, newAccess)
  })

  logger.debug('DFSP registered: %o', dfspData)
  return apiAccess
}
