import { type Response } from 'express'
import { type AuthRequest } from '../../types/express'
import {
  BulkMerchantDependencyError,
  BulkMerchantIdempotencyConflictError,
  BulkMerchantValidationError,
  importBulkMerchants
} from '../../services/bulkMerchantOnboarding'
import { parseBulkMerchantWorkbook } from '../../utils/merchantBulkWorkbook'
import logger from '../../services/logger'

/**
 * @openapi
 * /merchants/bulk-upload:
 *   post:
 *     tags: [Merchants]
 *     security:
 *       - Authorization: []
 *     summary: Validate and atomically import merchants from an XLSX workbook
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 128
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: All merchants were created in Review status
 *       409:
 *         description: Idempotency conflict
 *       422:
 *         description: Workbook validation failed; no records were created
 */
export async function postMerchantBulkUpload (
  req: AuthRequest,
  res: Response
): Promise<Response> {
  const portalUser = req.user
  if (portalUser == null) return res.status(401).send({ message: 'Unauthorized' })
  if (req.file == null) return res.status(400).send({ message: 'XLSX workbook is required' })

  const idempotencyKey = req.header('Idempotency-Key')?.trim()
  if (idempotencyKey == null || idempotencyKey.length === 0 || idempotencyKey.length > 128) {
    return res.status(400).send({
      message: 'Idempotency-Key header is required and cannot exceed 128 characters'
    })
  }

  const parsed = await parseBulkMerchantWorkbook(req.file.buffer)
  if (parsed.data === undefined) {
    return res.status(422).send({
      message: 'Workbook validation failed. No merchants were created.',
      errors: parsed.issues
    })
  }

  try {
    const result = await importBulkMerchants(
      parsed.data,
      portalUser,
      idempotencyKey,
      req.file.buffer
    )
    return res.status(result.idempotent_replay === true ? 200 : 201).send({
      message: result.idempotent_replay === true
        ? 'Bulk merchant import already completed'
        : 'Bulk merchant onboarding completed',
      data: result
    })
  } catch (error) {
    if (error instanceof BulkMerchantValidationError) {
      return res.status(422).send({
        message: 'Workbook validation failed. No merchants were created.',
        errors: error.issues
      })
    }
    if (error instanceof BulkMerchantIdempotencyConflictError) {
      return res.status(409).send({ message: error.message })
    }
    if (error instanceof BulkMerchantDependencyError) {
      return res.status(503).send({ message: error.message })
    }
    logger.error('Bulk merchant onboarding failed: %o', error)
    return res.status(500).send({
      message: 'Bulk merchant onboarding failed. No merchants were created.'
    })
  }
}
