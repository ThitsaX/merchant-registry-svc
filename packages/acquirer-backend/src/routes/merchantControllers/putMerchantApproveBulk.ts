/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Response } from 'express'
import { AppDataSource } from '../../database/dataSource'
import { MerchantEntity } from '../../entity/MerchantEntity'
import logger from '../../services/logger'
import {
  MerchantRegistrationStatus,
  AuditActionType,
  AuditTrasactionStatus,
  isMerchantClassificationCode
} from 'shared-lib'
import { In } from 'typeorm'
import { audit } from '../../utils/audit'
import { type AuthRequest } from 'src/types/express'
import {
  type RegistryMerchantData,
  registerMerchantsWithRegistry
} from '../../services/registryOracleClient'

/**
 * @openapi
 * /merchants/bulk-approve:
 *   put:
 *     tags:
 *       - Merchants
 *       - Merchant Status
 *     security:
 *       - Authorization: []
 *     summary: Bulk Approve the registration status of multiple Merchant Records
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: List of Merchant Record IDs to be updated
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Status Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */

export async function putBulkWaitingAliasGeneration (req: AuthRequest, res: Response) {
  const portalUser = req.user

  /* istanbul ignore if */
  if (portalUser == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  const ids: number[] = req.body.ids
  const merchantRepository = AppDataSource.getRepository(MerchantEntity)

  logger.debug(`putBulkApprove ids: ${JSON.stringify(ids)}`)

  // Validate IDs
  if (!Array.isArray(ids) || ids.length === 0) {
    await audit(
      AuditActionType.UPDATE,
      AuditTrasactionStatus.FAILURE,
      'putBulkApprove',
      'IDs must be an array of numbers',
      'MerchantEntity',
      {}, {}, portalUser
    )
    return res.status(422).send({ message: 'IDs must be an array.' })
  }

  for (const id of ids) {
    if (isNaN(Number(id)) || Number(id) < 1) {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putBulkApprove',
        'ID must be a valid ID number',
        'Merchant',
        {}, {}, portalUser
      )

      return res.status(422).send({ message: 'Each ID in the array must be a valid ID number.' })
    }
  }

  const merchants = await merchantRepository.find({
    where: {
      id: In(ids)
    },
    relations: [
      'created_by',
      'dfsps',
      'currency_code',
      'checkout_counters'
    ]
  })

  for (const merchant of merchants) {
    if (merchant.registration_status !== MerchantRegistrationStatus.REVIEW) {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putBulkApprove',
        'Merchant is not in Review Status',
        'Merchant',
        {}, {}, portalUser
      )
      return res.status(422).send({
        // eslint-disable-next-line max-len
        message: `Merchant ${merchant.id} is not in Review Status. Current Status: ${merchant.registration_status}`
      })
    }

    if (merchant.created_by?.id === portalUser.id) {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putBulkApprove',
        'Merchant cannot be approve by the same user who submitted it',
        'Merchant',
        {}, {}, portalUser
      )
      return res.status(422).send({
        message: `Merchant ${merchant.id} cannot be approved by the same user who submitted it.`
      })
    }

    const validMerchantForUser = merchant.dfsps
      .map(dfsp => dfsp.id)
      .includes(portalUser.dfsp.id)

    if (!validMerchantForUser) {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putBulkApprove',
        'Merchant does not belong to the same DFSP as the user',
        'Merchant',
        {}, {}, portalUser
      )
      return res.status(422).send({
        message: `Merchant ${merchant.id} does not belong to the same DFSP as the user.`
      })
    }

    if (merchant.mcc == null || !isMerchantClassificationCode(merchant.mcc)) {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putBulkApprove',
        'Merchant is missing a valid merchant category code',
        'Merchant',
        {}, {}, portalUser
      )
      return res.status(422).send({
        message: `Merchant ${merchant.id} does not have a valid merchant category code (MCC).`
      })
    }
  }

  try {
    await merchantRepository
      .createQueryBuilder()
      .update(MerchantEntity)
      .set({
        registration_status: MerchantRegistrationStatus.WAITINGALIASGENERATION,
        registration_status_reason: 'Bulk Updated to "Waiting For Alias Generation"',
        checked_by: portalUser,
        gleif_verified_at: new Date()
      })
      .whereInIds(ids)
      .execute()

    await audit(
      AuditActionType.UPDATE,
      AuditTrasactionStatus.SUCCESS,
      'putBulkApprove',
      'Status Updated to "Waiting For Alias Generation"',
      'Merchant',
      {}, {}, portalUser
    )

    const registryMerchantData: RegistryMerchantData[] = merchants.map(merchant => {
      const dfsp = merchant.dfsps[0]
      const checkoutCounter = merchant.checkout_counters[0]
      if (dfsp === undefined) {
        throw new Error(`Merchant ${merchant.id} is missing a DFSP`)
      }
      return {
        merchant_id: merchant.id,
        dfsp_name: dfsp.name,
        fspId: dfsp.fspId,
        checkout_counter_id: checkoutCounter?.id,
        currency_code: merchant.currency_code,
        lei: merchant.lei
      }
    })

    try {
      await registerMerchantsWithRegistry(registryMerchantData)
    } catch (error) {
      await merchantRepository
        .createQueryBuilder()
        .update(MerchantEntity)
        .set({
          registration_status: MerchantRegistrationStatus.REVIEW,
          registration_status_reason: 'Registry synchronization failed; approval can be retried'
        })
        .whereInIds(ids)
        .execute()
      throw error
    }

    res.status(200).send({
      message: '"Waiting For Alias Generation" Status Updated for multiple merchants'
    })
  } catch (e)/* istanbul ignore next */ {
    logger.error(e)
    await audit(
      AuditActionType.UPDATE,
      AuditTrasactionStatus.FAILURE,
      'putBulkApprove',
      'Status Update Failed',
      'Merchant',
      {}, {}, portalUser
    )
    res.status(500).send({ message: e })
  }
}
