import {
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus
} from 'shared-lib'
import { AppDataSource } from '../../src/database/dataSource'
import {
  backfillApprovedMerchantAllowStatus
} from '../../src/database/initDatabase'
import { MerchantEntity } from '../../src/entity/MerchantEntity'
import logger from '../../src/services/logger'

logger.silent = true

describe('merchant approval state', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('backfills only approved merchants that are still pending', async () => {
    const update = jest.spyOn(AppDataSource.manager, 'update').mockResolvedValue({
      raw: [],
      affected: 1,
      generatedMaps: []
    })

    await backfillApprovedMerchantAllowStatus(AppDataSource)

    expect(update).toHaveBeenCalledWith(
      MerchantEntity,
      {
        registration_status: MerchantRegistrationStatus.APPROVED,
        allow_block_status: MerchantAllowBlockStatus.PENDING
      },
      {
        allow_block_status: MerchantAllowBlockStatus.ALLOWED
      }
    )
  })
})
