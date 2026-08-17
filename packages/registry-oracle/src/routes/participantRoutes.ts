/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-misused-promises */
import express, { type Request, type Response } from 'express'
import { AuditActionType, AuditTrasactionStatus } from 'shared-lib'
import { AppDataSource } from '../database/dataSource'
import { RegistryEntity } from '../entity/RegistryEntity'
import { authenticateAPIAccess } from '../middleware/authenticate'
import logger from '../services/logger'
import { type EndpointAuthRequest } from '../types/express'
import { audit } from '../utils/audit'
import { prepareError } from '../utils/error'
import { ALIAS_VALUE_MAX_LENGTH, findIncrementAliasValue, parseAliasValue } from '../utils/utils'

const router = express.Router()

/**
 * Common function to lookup registry records by alias_value
 */
async function lookupRegistryRecord (
  id: string,
  actionType: string,
  actionDescription: string
): Promise<RegistryEntity | null> {
  const registryRecord = await AppDataSource.manager.findOne(RegistryEntity, {
    where: { alias_value: id },
    select: ['fspId', 'currency', 'lei', 'alias_value']
  })

  const transactionStatus = registryRecord == null
    ? AuditTrasactionStatus.FAILURE
    : AuditTrasactionStatus.SUCCESS

  await audit(
    AuditActionType.ACCESS,
    transactionStatus,
    actionType,
    actionDescription,
    'RegistryEntity',
    {},
    { partyList: registryRecord, id }
  )

  logger.debug('registryRecord %s Retrieved: %o', id, registryRecord)
  return registryRecord
}

/**
 * @openapi
 * tags:
 *   name: Participants
 *
 * /participants/{type}/{id}:
 *   get:
 *     tags:
 *       - Participants
 *     summary: Get Participants based on type and ID
 *     parameters:
 *       - name: type
 *         in: path
 *         required: true
 *         description: Type of the participant; accepted as supplied by the caller
 *         schema:
 *           type: string
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the participant (can be merchant alias or LEI code)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved participant(s)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 partyList:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fspId:
 *                         type: string
 *                       currency:
 *                         type: string
 *                       lei:
 *                         type: string
 *                         description: Legal Entity Identifier
 *                       alias_value:
 *                         type: string
 *                         description: Merchant identifier or alias
 *       400:
 *         description: Invalid ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 */
router.get('/participants/:type/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  // The id can be either a merchant alias or an LEI code - we don't need to validate format
  // since the database lookup will handle both cases
  const registryRecord = await lookupRegistryRecord(
    id,
    'getParticipants',
    'GET Participants: Participant retrieved'
  )

  res.send({ partyList: registryRecord !== null ? [registryRecord] : [] })
})

/**
 * @openapi
 * tags:
 *   name: Parties
 *
 * /parties/{type}/{id}:
 *   get:
 *     tags:
 *       - Parties
 *     summary: Get party information based on type and ID
 *     parameters:
 *       - name: type
 *         in: path
 *         required: true
 *         description: Type of the party identifier; accepted as supplied by the caller
 *         schema:
 *           type: string
 *       - name: id
 *         in: path
 *         required: true
 *         description: LEI code or merchant identifier
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved party information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 partyList:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fspId:
 *                         type: string
 *                       currency:
 *                         type: string
 *                       lei:
 *                         type: string
 *                         description: Legal Entity Identifier
 *                       alias_value:
 *                         type: string
 *                         description: Merchant identifier or alias
 *       400:
 *         description: Invalid ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 */
router.get('/parties/:type/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  // The id should be the LEI code - we lookup using alias_value
  const registryRecord = await lookupRegistryRecord(
    id,
    'getParties',
    'GET Parties: Party retrieved'
  )

  res.send({ partyList: registryRecord !== null ? [registryRecord] : [] })
})

/**
 * @openapi
 * tags:
 *   name: Participants
 *
 * /participants:
 *   post:
 *     tags:
 *       - Participants
 *     summary: Create new participants (Batch Operation)
 *     parameters:
 *       - name: x-api-key
 *         in: header
 *         required: true
 *         description: API key for accessing the endpoint
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 merchant_id:
 *                   type: string
 *                   description: DFSP's Merchant Identifier. Will not save in Oracle DB.
 *                   example: "10002"
 *                 currency:
 *                   type: string
 *                   description: Currency code
 *                   example: "USD"
 *                 alias_value:
 *                   type: string
 *                   description: Alphanumeric alias containing letters, numbers, underscores, or hyphens
 *                   required: false
 *                   minLength: 1
 *                   maxLength: 32
 *                   pattern: '^[A-Za-z0-9_-]+$'
 *                   example: "abc1234"
 *             example:
 *               - merchant_id: "10002"
 *                 currency: "USD"
 *                 alias_value: "abc1234"
 *               - merchant_id: "10003"
 *                 currency: "EUR"
 *                 alias_value: "shop_0002"
 *               - merchant_id: "10004"
 *                 currency: "JPY"
 *
 *     responses:
 *       200:
 *         description: Successfully created participants
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   merchant_id:
 *                     type: string
 *                   currency:
 *                     type: string
 *                   alias_value:
 *                     type: string
 *       400:
 *         description: Invalid input, object invalid, or authentication error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *
 */
router.post('/participants', authenticateAPIAccess, async (req: EndpointAuthRequest, res: Response) => {
  const dfsp = req.dfsp
  if (dfsp == null) {
    logger.error('Invalid Endpoint')
    await audit(
      AuditActionType.ADD,
      AuditTrasactionStatus.FAILURE,
      'postParticipants',
      'POST Participants: Invalid DFSP',
      'RegistryEntity',
      {}, {}, dfsp
    )
    return res.status(400).send(prepareError('Authentication Error'))
  }

  const participants = req.body

  if (!Array.isArray(participants)) {
    return res.status(400).send(prepareError('Invalid request body, array expected'))
  }

  const registryRepository = AppDataSource.getRepository(RegistryEntity)

  const results = []

  for (const participant of participants) {
    // eslint-disable-next-line
    const { merchant_id, currency, alias_value } = participant

    if (merchant_id === undefined || merchant_id == null) {
      logger.error('Invalid Merchant ID')
      await audit(
        AuditActionType.ADD,
        AuditTrasactionStatus.FAILURE,
        'postParticipants',
        'POST Participants: Merchant ID is required',
        'RegistryEntity',
        {}, { merchant_id }
      )
      results.push({
        merchant_id: null,
        success: false,
        message: 'Merchant ID is required',
        alias_value: null
      })
      continue
    }

    if (currency === undefined || currency == null) {
      logger.error('Currency is required')
      await audit(
        AuditActionType.ADD,
        AuditTrasactionStatus.FAILURE,
        'postParticipants',
        'POST Participants: Currency is required',
        'RegistryEntity',
        {}, { currency }
      )
      results.push({
        merchant_id: participant.merchant_id,
        success: false,
        message: 'Currency is required',
        alias_value: null
      })
      continue
    }

    let paddedAliasValue = alias_value
    let headPointerAliasValue: RegistryEntity | null = null

    if (alias_value === undefined || alias_value == null) {
      // find head pointer
      headPointerAliasValue = await registryRepository.findOne({
        where: { is_incremental_head: true }
      })

      if (headPointerAliasValue != null) {
        // If head pointer exists, just increment it
        paddedAliasValue = await findIncrementAliasValue(headPointerAliasValue.alias_value)
      } else {
        // If no record exists, start from 1
        paddedAliasValue = await findIncrementAliasValue('0')
      }
    } else {
      const parsedAliasValue = parseAliasValue(alias_value)
      if (parsedAliasValue === null) {
        const message = `Invalid Alias Value - use 1-${ALIAS_VALUE_MAX_LENGTH} letters, numbers, underscores, or hyphens`
        logger.error('Invalid Alias Value')
        await audit(
          AuditActionType.ADD,
          AuditTrasactionStatus.FAILURE,
          'postParticipants',
          'POST Participants: Invalid Alias Value',
          'RegistryEntity',
          {}, { alias_value }
        )
        results.push({
          merchant_id: participant.merchant_id,
          success: false,
          message,
          alias_value: null
        })
        continue
      }
      paddedAliasValue = parsedAliasValue

      // Check if the alias_value already exists
      const isAliasExists = await registryRepository.exist({
        where: { alias_value: paddedAliasValue },

        select: ['alias_value']
      })

      if (isAliasExists) {
        logger.error('Alias Value already exists')
        await audit(
          AuditActionType.ADD,
          AuditTrasactionStatus.FAILURE,
          'postParticipants',
          'POST Participants: Alias Value already exists',
          'RegistryEntity',
          {}, { alias_value: paddedAliasValue }
        )
        results.push({
          merchant_id: participant.merchant_id,
          success: false,
          message: 'Alias Value already exists',
          alias_value: null
        })
        continue
      }
    }

    const newRegistryRecord = new RegistryEntity()
    newRegistryRecord.fspId = dfsp.fspId // TODO: Should be the FSP ID of registered API Accessed DFSP
    newRegistryRecord.dfsp_name = dfsp.dfsp_name
    newRegistryRecord.currency = currency
    newRegistryRecord.alias_value = paddedAliasValue

    // If alias_value is not provided by external DFSP, Mark the new record as head pointer
    if (alias_value === undefined || alias_value == null) {
      // Update the head pointer

      if (headPointerAliasValue != null) {
        // is_incremental_head false for the old head pointer
        headPointerAliasValue.is_incremental_head = false
        try {
          await AppDataSource.manager.save(headPointerAliasValue)
        } catch (err) {
          logger.error('Error saving headPointerAliasValue: %o', err)
          await audit(
            AuditActionType.ADD,
            AuditTrasactionStatus.FAILURE,
            'postParticipants',
            'POST Participants: Error Updating Incremental Head Pointer',
            'RegistryEntity',
            {}, { err }
          )
          results.push({
            merchant_id: participant.merchant_id,
            success: false,
            message: 'Error Updating Incremental Head Pointer',
            alias_value: null
          })
          continue
        }
      }

      newRegistryRecord.is_incremental_head = true
    }

    try {
      await AppDataSource.manager.save(newRegistryRecord)
      await audit(
        AuditActionType.ADD,
        AuditTrasactionStatus.SUCCESS,
        'postParticipants',
        'POST Participants: Participant created',
        'RegistryEntity',
        {}, { fspId: dfsp.fspId, currency }
      )
      results.push({
        merchant_id: participant.merchant_id,
        success: true,
        message: 'Participant created',
        alias_value: paddedAliasValue
      })
      continue
    } catch (err) {
      logger.error('Error saving new record: %o', err)
      await audit(
        AuditActionType.ADD,
        AuditTrasactionStatus.FAILURE,
        'postParticipants',
        'POST Participants: Error saving new record',
        'RegistryEntity',
        {}, { err }
      )
      results.push({
        merchant_id: participant.merchant_id,
        success: false,
        message: 'Error saving new record',
        alias_value: null
      })
      continue
    }
  } // end of for loop for participants

  res.send(results)
})

export default router
