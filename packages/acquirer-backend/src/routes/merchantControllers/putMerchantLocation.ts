/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Response } from 'express'
import { QueryFailedError } from 'typeorm'
import { AppDataSource } from '../../database/dataSource'
import { MerchantEntity } from '../../entity/MerchantEntity'
import { MerchantLocationEntity } from '../../entity/MerchantLocationEntity'
import logger from '../../services/logger'

import {
  MerchantLocationSubmitDataSchema
} from '../schemas'
import { audit } from '../../utils/audit'
import { AuditActionType, AuditTrasactionStatus } from 'shared-lib'
import { type AuthRequest } from 'src/types/express'
import { gleifService } from '../../services/GLEIFService'
import {
  CheckoutCounterAliasAvailabilityError,
  CheckoutCounterAliasConflictError,
  InvalidCheckoutCounterError,
  syncCheckoutCounters,
  validateCheckoutCounterAliases
} from '../../services/checkoutCounters'

/**
 * @openapi
 * /merchants/{merchantId}/locations/{locationId}:
 *   put:
 *     tags:
 *       - Merchants
 *       - Merchant Locations
 *     security:
 *       - Authorization: []
 *     summary: Update old location for a Merchant
 *     parameters:
 *      - in: path
 *        name: merchantId
 *        schema:
 *          type: number
 *        required: true
 *        description: Numeric ID of the Merchant Record
 *      - in: path
 *        name: locationId
 *        schema:
 *          type: number
 *        required: true
 *        description: Numeric ID of the Location
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location_type:
 *                 type: string
 *                 example: "Physical"
 *               web_url:
 *                 type: string
 *                 example: "http://www.example.com"
 *               address_type:
 *                 type: string
 *                 example: "Office"
 *               department:
 *                 type: string
 *                 example: "Sales"
 *               sub_department:
 *                 type: string
 *                 example: "Support"
 *               street_name:
 *                 type: string
 *                 example: "Main Street"
 *               building_number:
 *                 type: string
 *                 example: "123"
 *               building_name:
 *                 type: string
 *                 example: "Big Building"
 *               floor_number:
 *                 type: string
 *                 example: "4"
 *               room_number:
 *                 type: string
 *                 example: "101"
 *               post_box:
 *                 type: string
 *                 example: "PO Box 123"
 *               postal_code:
 *                 type: string
 *                 example: "12345"
 *               town_name:
 *                 type: string
 *                 example: "Townsville"
 *               district_name:
 *                 type: string
 *                 example: "District 1"
 *               country_subdivision:
 *                 type: string
 *                 example: "State"
 *               country:
 *                 type: string
 *                 example: "United States of America"
 *               address_line:
 *                 type: string
 *                 example: "123 Main Street, Townsville"
 *               latitude:
 *                 type: string
 *                 example: "40.7128"
 *               longitude:
 *                 type: string
 *                 example: "74.0060"
 *               checkout_counters:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required:
 *                     - description
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Existing checkout-counter ID
 *                     description:
 *                       type: string
 *                       example: "Main till"
 *                     alias_value:
 *                       type: string
 *                       description: Optional globally unique custom alias
 *                       example: "SHOP-123-MAIN"
 *               checkout_description:
 *                 type: string
 *                 deprecated: true
 *                 description: Legacy single-counter description
 *     responses:
 *       200:
 *         description: Merchant Location Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
export async function putMerchantLocation (req: AuthRequest, res: Response) {
  const portalUser = req.user

  /* istanbul ignore if  */
  if (portalUser == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  const merchantId = Number(req.params.merchantId)
  if (isNaN(merchantId) || merchantId < 1) {
    logger.error('Invalid Merchant ID')
    res.status(422).send({ message: 'Invalid Merchant ID' })
    return
  }

  const locationId = Number(req.params.locationId)
  if (isNaN(locationId) || locationId < 1) {
    logger.error('Invalid Location ID')
    res.status(422).send({ message: 'Invalid Location ID' })
    return
  }

  const locationData = req.body
  const validationResult = MerchantLocationSubmitDataSchema.safeParse(locationData)
  if (!validationResult.success) {
    const issues = validationResult.error.issues.map(issue => issue.message)
    logger.error('Merchant Location Validation error: %o', issues)
    return res.status(422).send({ message: issues })
  }

  const {
    checkout_counters: submittedCounters,
    checkout_description: legacyCheckoutDescription,
    ...validatedLocationData
  } = validationResult.data

  // Find merchant
  const merchantRepository = AppDataSource.getRepository(MerchantEntity)
  const merchant = await merchantRepository.findOne({
    where: { id: merchantId },
    relations: [
      'locations',
      'locations.checkout_counters',
      'checkout_counters',
      'checkout_counters.checkout_location',
      'dfsps'
    ]
  })
  if (merchant == null) {
    logger.error('Merchant not found')
    return res.status(404).json({ message: 'Merchant not found' })
  }

  const validMerchantForUser = merchant.dfsps
    .map(dfsp => dfsp.id)
    .includes(portalUser.dfsp.id)
  if (!validMerchantForUser) {
    logger.error('Accessing different DFSP\'s Merchant is not allowed.')
    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.FAILURE,
      'putMerchantLocation',
          `User ${portalUser.id} (${portalUser.email}) 
trying to access unauthorized(different DFSP) merchant ${merchant.id}`,
          'MerchantEntity',
          {}, { merchantId, locationId, body: req.body }, portalUser
    )
    return res.status(400).send({
      message: 'Accessing different DFSP\'s Merchant is not allowed.'
    })
  }

  // Find Location
  const location = merchant.locations.find(location => location.id === locationId)
  if (location == null || location === undefined) {
    logger.error('Merchant Location not found')
    return res.status(404).json({ message: 'Merchant Location not found' })
  }

  const legacyDescription = legacyCheckoutDescription?.trim()
  const existingCounterInputs = (location.checkout_counters ?? []).map((counter, index) => {
    const existingDescription = counter.description?.trim()
    return {
      id: counter.id,
      description: index === 0 && legacyDescription !== undefined && legacyDescription.length > 0
        ? legacyDescription
        : (
            existingDescription !== undefined && existingDescription.length > 0
              ? existingDescription
              : `Checkout counter ${index + 1}`
          )
    }
  })
  const counterInputs = submittedCounters ?? (
    existingCounterInputs.length > 0
      ? existingCounterInputs
      : [{
          description: legacyDescription !== undefined && legacyDescription.length > 0
            ? legacyDescription
            : 'Main checkout counter'
        }]
  )

  try {
    await validateCheckoutCounterAliases(merchant, locationId, counterInputs)
  } catch (error) {
    if (error instanceof CheckoutCounterAliasConflictError) {
      return res.status(409).send({
        message: error.message,
        field: `checkout_counters.${error.counterIndex}.alias_value`,
        counter_index: error.counterIndex
      })
    }
    if (error instanceof CheckoutCounterAliasAvailabilityError) {
      logger.error('Unable to verify checkout counter alias availability: %o', error)
      return res.status(503).send({
        message: error.message,
        field: `checkout_counters.${error.counterIndex}.alias_value`,
        counter_index: error.counterIndex
      })
    }
    throw error
  }

  // GLEIF Location validation
  if (merchant.lei !== null && merchant.lei !== undefined && merchant.lei !== '') {
    const validationResult = await gleifService.validateLocation(
      merchant.lei,
      validatedLocationData.street_name ?? '',
      validatedLocationData.building_number ?? '',
      validatedLocationData.postal_code ?? '',
      validatedLocationData.town_name ?? '',
      validatedLocationData.country_subdivision ?? '',
      validatedLocationData.country ?? '',
      validatedLocationData.address_line ?? ''
    )

    if (!validationResult.isValid) {
      logger.error('GLEIF Location validation failed: %s', validationResult.error)
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.FAILURE,
        'putMerchantLocation',
        `GLEIF Location validation failed: ${validationResult.error}`,
        'MerchantLocationEntity',
        {}, { merchantId, locationId, body: req.body }, portalUser
      )
      return res.status(422).send({
        message: validationResult.error ?? 'GLEIF Location validation failed'
      })
    }
  }

  try {
    await AppDataSource.transaction(async manager => {
      Object.assign(location, validatedLocationData)
      const savedLocation = await manager.save(MerchantLocationEntity, location)
      await syncCheckoutCounters(manager, merchant, savedLocation, counterInputs)
    })
  } catch (err)/* istanbul ignore next */ {
    if (err instanceof InvalidCheckoutCounterError) {
      return res.status(422).send({ message: err.message })
    }
    if (err instanceof QueryFailedError) {
      logger.error('Query Failed: %o', err.message)
      return res.status(500).send({ message: err.message })
    }
    throw err
  }

  await audit(
    AuditActionType.UPDATE,
    AuditTrasactionStatus.SUCCESS,
    'putMerchantLocation',
    'Merchant Location Updated',
    'MerchantLocationEntity',
    {}, { merchantId, locationId, body: req.body }, portalUser
  )
  return res.status(200).send({ message: 'Merchant Location Updated' })
}
