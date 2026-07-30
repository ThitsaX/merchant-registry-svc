/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { type Response } from 'express'
import {
  AuditActionType,
  AuditTrasactionStatus,
  isMerchantClassificationCode,
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus
} from 'shared-lib'
import { type AuthRequest } from '../../types/express'
import { AppDataSource } from '../../database/dataSource'
import { MerchantEntity } from '../../entity/MerchantEntity'
import { DynamicQRSubmitDataSchema } from '../schemas'
import { generateQRImage, getEMVQRCodeText } from '../../services/generateQRImage'
import { countryNameToCode } from '../../services/SubdivisionMappingService'
import { readEnv } from '../../setup/readEnv'
import { audit } from '../../utils/audit'
import logger from '../../services/logger'

const EMVCO_MERCHANT_ACCOUNT_GUI = readEnv(
  'EMVCO_MERCHANT_ACCOUNT_GUI',
  'org.mojaloop'
) as string

/**
 * @openapi
 * /merchants/{merchantId}/checkout-counters/{checkoutCounterId}/dynamic-qr:
 *   post:
 *     tags:
 *       - Merchants
 *       - Checkout Counters
 *     security:
 *       - Authorization: []
 *     summary: Generate a transaction-specific EMVCo merchant QR code
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: path
 *         name: checkoutCounterId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - reference
 *             properties:
 *               amount:
 *                 type: string
 *                 example: "12.50"
 *                 description: Positive decimal amount in the merchant's registered currency
 *               reference:
 *                 type: string
 *                 maxLength: 25
 *                 example: "ORDER-2026-00042"
 *                 description: Merchant-supplied order or invoice reference
 *     responses:
 *       200:
 *         description: Dynamic QR generated
 *       403:
 *         description: User lacks permission to generate dynamic QR codes
 *       404:
 *         description: Merchant or checkout counter not found
 *       409:
 *         description: Merchant or checkout counter is not ready to receive payments
 *       422:
 *         description: Invalid path parameter or request body
 */
export async function postDynamicQR (req: AuthRequest, res: Response) {
  const portalUser = req.user
  if (portalUser == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  const merchantId = Number(req.params.merchantId)
  const checkoutCounterId = Number(req.params.checkoutCounterId)
  if (
    !Number.isInteger(merchantId) ||
    merchantId < 1 ||
    !Number.isInteger(checkoutCounterId) ||
    checkoutCounterId < 1
  ) {
    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.FAILURE,
      'postDynamicQR',
      'Invalid merchant or checkout counter ID',
      'CheckoutCounterEntity',
      {},
      { params: req.params },
      portalUser
    )
    return res.status(422).send({
      message: 'Merchant ID and checkout counter ID must be positive integers'
    })
  }

  const parsedBody = DynamicQRSubmitDataSchema.safeParse(req.body)
  if (!parsedBody.success) {
    const errors = parsedBody.error.flatten().fieldErrors
    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.FAILURE,
      'postDynamicQR',
      'Dynamic QR request validation failed',
      'CheckoutCounterEntity',
      {},
      { params: req.params, errors },
      portalUser
    )
    return res.status(422).send({
      message: 'Invalid dynamic QR request',
      errors
    })
  }

  try {
    const merchant = await AppDataSource.getRepository(MerchantEntity).findOne({
      where: { id: merchantId },
      relations: [
        'currency_code',
        'dfsps',
        'checkout_counters',
        'checkout_counters.checkout_location'
      ]
    })

    if (merchant == null) {
      return res.status(404).send({ message: 'Merchant not found' })
    }

    const belongsToUsersDFSP = merchant.dfsps.some(
      dfsp => dfsp.id === portalUser.dfsp?.id
    )
    if (!belongsToUsersDFSP) {
      await audit(
        AuditActionType.ACCESS,
        AuditTrasactionStatus.FAILURE,
        'postDynamicQR',
        `User ${portalUser.id} attempted to generate a QR for merchant ${merchantId}`,
        'CheckoutCounterEntity',
        {},
        { merchantId, checkoutCounterId },
        portalUser
      )
      return res.status(404).send({ message: 'Merchant not found' })
    }

    if (
      merchant.registration_status !== MerchantRegistrationStatus.APPROVED ||
      merchant.allow_block_status !== MerchantAllowBlockStatus.ALLOWED
    ) {
      return res.status(409).send({
        message: 'Merchant is not approved to receive payments'
      })
    }

    if (merchant.mcc == null || !isMerchantClassificationCode(merchant.mcc)) {
      return res.status(409).send({
        message: 'Merchant does not have an approved merchant category code'
      })
    }

    const checkoutCounter = merchant.checkout_counters.find(
      counter => counter.id === checkoutCounterId
    )
    if (checkoutCounter == null) {
      return res.status(404).send({ message: 'Checkout counter not found' })
    }

    const alias = checkoutCounter.alias_value?.trim()
    const location = checkoutCounter.checkout_location
    if (alias == null || alias.length === 0) {
      return res.status(409).send({
        message: 'Checkout counter does not have a registered merchant alias'
      })
    }
    if (location == null) {
      return res.status(409).send({
        message: 'Checkout counter does not have a registered location'
      })
    }

    const rawCountry = location.country?.trim() ?? ''
    const countryCode = /^[A-Za-z]{2}$/.test(rawCountry)
      ? rawCountry.toUpperCase()
      : countryNameToCode(rawCountry)
    const townName = location.town_name?.trim() ?? ''
    const districtName = location.district_name?.trim() ?? ''
    const merchantCity = (
      townName.length > 0 ? townName : districtName
    ).slice(0, 15).trimEnd()
    const merchantName = merchant.dba_trading_name?.trim().slice(0, 25).trimEnd() ?? ''
    const checkoutCounterReference = checkoutCounter.guid?.trim()

    if (countryCode == null || merchantCity.length === 0 || merchantName.length === 0) {
      return res.status(409).send({
        message: 'Merchant name, city, and ISO country are required to generate a QR code'
      })
    }

    const qrPayload = getEMVQRCodeText({
      globallyUniqueIdentifier: EMVCO_MERCHANT_ACCOUNT_GUI,
      checkoutCounterAliasValue: alias,
      checkoutCounterReference:
        checkoutCounterReference != null && checkoutCounterReference.length > 0
          ? checkoutCounterReference
          : undefined,
      merchantCategoryCode: merchant.mcc,
      transactionCurrency: merchant.currency_code.iso_code,
      countryCode,
      merchantName,
      merchantCity,
      transactionAmount: parsedBody.data.amount,
      transactionReference: parsedBody.data.reference
    })
    const qrImage = await generateQRImage(qrPayload, { width: 512 })

    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.SUCCESS,
      'postDynamicQR',
      `Generated dynamic QR for merchant ${merchantId}, counter ${checkoutCounterId}`,
      'CheckoutCounterEntity',
      {},
      {
        merchantId,
        checkoutCounterId,
        amount: parsedBody.data.amount,
        reference: parsedBody.data.reference
      },
      portalUser
    )

    return res.status(200).send({
      message: 'Dynamic QR generated',
      data: {
        merchant_id: merchantId,
        checkout_counter_id: checkoutCounterId,
        amount: parsedBody.data.amount,
        currency: merchant.currency_code.iso_code,
        reference: parsedBody.data.reference,
        qr_payload: qrPayload,
        qr_image_data_url: `data:image/png;base64,${qrImage.toString('base64')}`
      }
    })
  } catch (error) /* istanbul ignore next */ {
    logger.error('Error generating dynamic QR: %o', error)
    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.FAILURE,
      'postDynamicQR',
      `Failed to generate dynamic QR for merchant ${merchantId}`,
      'CheckoutCounterEntity',
      {},
      { merchantId, checkoutCounterId },
      portalUser
    )
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}
