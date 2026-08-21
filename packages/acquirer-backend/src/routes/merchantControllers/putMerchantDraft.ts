/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Response } from 'express'
import { QueryFailedError } from 'typeorm'
import * as z from 'zod'
import { AppDataSource } from '../../database/dataSource'
import { MerchantEntity } from '../../entity/MerchantEntity'
import logger from '../../services/logger'
import { BusinessLicenseEntity } from '../../entity/BusinessLicenseEntity'
import {
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus
  , AuditActionType, AuditTrasactionStatus
} from 'shared-lib'

import {
  MerchantSubmitDataSchema
} from '../schemas'
import { uploadMerchantDocument } from '../../services/S3Client'

import { audit } from '../../utils/audit'
import { type AuthRequest } from 'src/types/express'
import { gleifService } from '../../services/GLEIFService'
import {
  findGlobalMerchantLeiRegistration,
  isMerchantLeiUniqueConstraintError,
  merchantLeiConflictResponse,
  normalizeMerchantLei
} from '../../services/merchantLei'
import {
  isRequestedMerchantAliasAvailable,
  saveRequestedMerchantAlias
} from '../../services/merchantAlias'
/**
 * @openapi
 * /merchants/{id}/draft:
 *   put:
 *     tags:
 *       - Merchants
 *     security:
 *       - Authorization: []
 *     parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: number
 *        required: true
 *        description: Numeric ID of the Merchant Record
 *     summary: Update Merchant Draft
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dba_trading_name:
 *                 type: string
 *                 example: "Merchant 1"
 *               registered_name:
 *                 type: string
 *                 example: "Merchant 1"
 *               lei:
 *                 type: string
 *                 minLength: 20
 *                 maxLength: 20
 *                 pattern: '^[A-Za-z0-9]{20}$'
 *               employees_num:
 *                 type: string
 *                 example: "1 - 5"
 *               monthly_turnover:
 *                 type: number
 *                 example: 0.5
 *               currency_code:
 *                 type: string
 *                 example: "PHP"
 *               category_code:
 *                 type: string
 *                 example: "10410"
 *               mcc:
 *                 type: string
 *                 pattern: '^\d{4}$'
 *                 example: "5812"
 *               merchant_type:
 *                 type: string
 *                 example: "Individual"
 *               payinto_alias:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 32
 *                 pattern: '^[A-Za-z0-9_-]+$'
 *                 example: "LBR-MER-00012345"
 *                 required: false
 *               license_number:
 *                 type: string
 *                 example: "123456789"
 *                 required: true
 *
 *               license_document:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description:
 *          Updating Merchant Draft Successful
 *         content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                message:
 *                  type: string
 *                  example: "Updating Merchant Draft Successful"
 *                data:
 *                  type: object
 *
 *       422:
 *         description: Validation error
 *         content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                message:
 *                  type: string
 *                  example: "LEI validation failed: LEI not found in GLEIF database"
 *                field:
 *                  type: string
 *                  example: "lei"
 *       500:
 *         description: Server error
 */
// TODO: Protect the route with User Authentication (Keycloak)
// TODO: check if the authenticated user is a Maker
export async function putMerchantDraft (req: AuthRequest, res: Response) {
  const portalUser = req.user

  /* istanbul ignore if */
  if (portalUser == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  try {
    logger.debug('Validating request body: %o', req.body)
    MerchantSubmitDataSchema.parse(req.body)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors = err.issues.map(issue => `${issue.path.toString()}: ${issue.message}`)
      logger.error('Validation error: %o', errors)
      await audit(
        AuditActionType.ADD,
        AuditTrasactionStatus.FAILURE,
        'putMerchantDraft',
        'Validation error',
        'MerchantEntity',
        {}, req.body, portalUser
      )

      return res.status(422).send({ message: errors })
    }
  }

  req.body.lei = normalizeMerchantLei(req.body.lei)

  // Merchant ID validation
  const id = Number(req.params.id)
  if (isNaN(id)) {
    logger.error('Invalid ID')
    res.status(422).send({ message: 'Invalid ID' })
    return
  }

  const merchantRepository = AppDataSource.getRepository(MerchantEntity)
  const merchant = await merchantRepository.findOne({
    where: { id },
    relations: ['business_licenses', 'dfsps', 'checkout_counters']
  })

  if (merchant === null) {
    return res.status(422).send({ message: 'Merchant ID does not exist' })
  }

  const validMerchantForUser = merchant.dfsps
    .map(dfsp => dfsp.id)
    .includes(portalUser.dfsp.id)
  if (!validMerchantForUser) {
    logger.error('Accessing different DFSP\'s Merchant is not allowed.')
    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.FAILURE,
      'putMerchantDraft',
          `User ${portalUser.id} (${portalUser.email}) 
trying to access unauthorized(different DFSP) merchant ${merchant.id}`,
          'MerchantEntity',
          {}, {}, portalUser
    )
    return res.status(400).send({
      message: 'Accessing different DFSP\'s Merchant is not allowed.'
    })
  }

  if (merchant.registration_status !== MerchantRegistrationStatus.DRAFT &&
    merchant.registration_status !== MerchantRegistrationStatus.REVERTED) {
    return res.status(422).send({
      message: `Merchant is not in Draft Status. Current Status: ${merchant.registration_status}`
    })
  }

  try {
    const leiRegistration = await findGlobalMerchantLeiRegistration(req.body.lei, merchant.id)
    if (leiRegistration !== null) {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putMerchantDraft',
        'LEI is already registered',
        'MerchantEntity',
        {}, { lei: req.body.lei, registered_dfsps: leiRegistration.dfsps }, portalUser
      )
      return res.status(409).send(merchantLeiConflictResponse(leiRegistration))
    }
  } catch (error) {
    logger.error('Unable to verify LEI availability: %o', error)
    return res.status(503).send({
      message: 'Unable to verify LEI availability. Please try again.',
      field: 'lei'
    })
  }

  if (req.body.lei.length > 0) {
    logger.info('Starting LEI validation for: %s', req.body.lei)
    try {
      const leiValidation = await gleifService.validateLEI(
        req.body.lei,
        req.body.dba_trading_name ?? ''
      )
      if (!leiValidation.isValid) {
        logger.error('LEI validation failed: %o', leiValidation.error)
        await audit(
          AuditActionType.UPDATE,
          AuditTrasactionStatus.FAILURE,
          'putMerchantDraft',
          'LEI validation failed',
          'MerchantEntity',
          {}, { lei: req.body.lei, error: leiValidation.error }, portalUser
        )
        return res.status(422).send({
          message: `LEI validation failed: ${leiValidation.error}`,
          field: 'lei'
        })
      }
      logger.info('LEI validation successful for %s: %s', req.body.lei, leiValidation.entityName)
    } catch (error) {
      logger.error('LEI validation error: %o', error)
      if (!gleifService.isConfigured()) {
        logger.warn('GLEIF service not configured, skipping LEI validation')
      }
    }
  }

  const primaryCheckoutCounter = [...merchant.checkout_counters]
    .sort((left, right) => {
      const counterNumberDifference = left.counter_number - right.counter_number
      return counterNumberDifference !== 0
        ? counterNumberDifference
        : left.id - right.id
    })[0]

  try {
    const aliasAvailable = await isRequestedMerchantAliasAvailable(
      req.body.payinto_alias,
      primaryCheckoutCounter === undefined
        ? undefined
        : {
            merchantId: merchant.id,
            checkoutCounterId: primaryCheckoutCounter.id
          }
    )
    if (!aliasAvailable) {
      const aliasValue = req.body.payinto_alias.trim()
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putMerchantDraft',
        `PayInto alias already registered: ${aliasValue}`,
        'MerchantEntity',
        {}, { payinto_alias: aliasValue }, portalUser
      )
      return res.status(409).send({
        message: `PayInto alias "${aliasValue}" is already registered`,
        field: 'payinto_alias'
      })
    }
  } catch (error) {
    logger.error('Unable to verify PayInto alias availability: %o', error)
    return res.status(503).send({
      message: 'Unable to verify PayInto alias availability. Please try again.',
      field: 'payinto_alias'
    })
  }

  logger.debug('Updating Merchant: %o', merchant.id)
  const oldMerchant = { ...merchant } // Clone the merchant object for audit logging
  oldMerchant.business_licenses = []

  merchant.dba_trading_name = req.body.dba_trading_name
  merchant.registered_name = req.body.registered_name // TODO: check if already registered
  merchant.lei = req.body.lei.length > 0 ? req.body.lei : null
  merchant.lei_normalized = req.body.lei.length > 0 ? req.body.lei : null
  merchant.gleif_verified_at = req.body.lei.length > 0 ? new Date() : null
  merchant.employees_num = req.body.employees_num
  merchant.monthly_turnover = req.body.monthly_turnover
  merchant.currency_code = req.body.currency_code
  merchant.category_code = typeof req.body.category_code === 'string'
    ? req.body.category_code.trim()
    : req.body.category_code
  merchant.mcc = typeof req.body.mcc === 'string' && req.body.mcc.trim().length > 0
    ? req.body.mcc.trim()
    : null
  merchant.merchant_type = req.body.merchant_type
  merchant.registration_status = MerchantRegistrationStatus.DRAFT
  merchant.allow_block_status = MerchantAllowBlockStatus.PENDING

  if (portalUser !== null) { // Should never be null.. but just in case
    merchant.created_by = portalUser
  }
  try {
    await merchantRepository.save(merchant)
    await saveRequestedMerchantAlias(merchant, req.body.payinto_alias)

    // Update License Data
    const file = req.file
    const licenseNumber = req.body.license_number
    const licenseRepository = AppDataSource.getRepository(BusinessLicenseEntity)
    let license: BusinessLicenseEntity | null = merchant.business_licenses[0] ?? null

    if (license === null) {
      license = new BusinessLicenseEntity()
    }

    license.license_number = licenseNumber
    license.merchant = merchant

    if (file != null) {
      const documentPath = await uploadMerchantDocument(merchant, licenseNumber, file)
      if (documentPath == null) {
        logger.error('Failed to upload the PDF to Storage Server')
      } else {
        logger.debug('Successfully uploaded the PDF \'%s\' to Storage', documentPath)
        // Save the file info to the database
        license.license_document_link = documentPath
        await licenseRepository.save(license)
        merchant.business_licenses = [license]
        await merchantRepository.save(merchant)
      }
    } else {
      logger.debug('No PDF file submitted for the merchant')
    }
  } catch (err)/* istanbul ignore next */ {
    if (isMerchantLeiUniqueConstraintError(err)) {
      const concurrentRegistration = await findGlobalMerchantLeiRegistration(
        req.body.lei,
        merchant.id
      )
      return concurrentRegistration === null
        ? res.status(409).send({
          message: `LEI "${req.body.lei}" is already registered with another DFSP`,
          field: 'lei'
        })
        : res.status(409).send(merchantLeiConflictResponse(concurrentRegistration))
    }
    if (err instanceof QueryFailedError) {
      logger.error('Query Failed: %o', err.message)
      return res.status(500).send({ message: err.message })
    }
    logger.error('Error: %o', err)
    return res.status(500).send({ message: err })
  }

  // Remove created_by from the response to prevent password hash leaking
  const merchantData = {
    ...merchant,
    created_by: undefined,
    checkout_counters: merchant.checkout_counters?.map(checkoutCounter => {
      const { merchant, ...checkoutCounterData } = checkoutCounter
      return checkoutCounterData
    }),

    // Fix TypeError: Converting circular structure to JSON
    business_licenses: merchant.business_licenses?.map(license => {
      const { merchant, ...licenseData } = license
      return licenseData
    })
  }

  await audit(
    AuditActionType.UPDATE,
    AuditTrasactionStatus.SUCCESS,
    'putMerchantDraft',
    'Updating Merchant Draft Successful',
    'MerchantEntity',
    oldMerchant, { ...merchantData, business_licenses: [] }, portalUser
  )
  return res.status(200).send({ message: 'Updating Merchant Draft Successful', data: merchantData })
}
