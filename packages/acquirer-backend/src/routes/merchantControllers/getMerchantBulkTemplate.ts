import { type Response } from 'express'
import { type AuthRequest } from '../../types/express'
import { createBulkMerchantTemplate } from '../../utils/merchantBulkWorkbook'

/**
 * @openapi
 * /merchants/bulk-upload/template:
 *   get:
 *     tags: [Merchants]
 *     security:
 *       - Authorization: []
 *     summary: Download the bulk merchant onboarding XLSX template
 *     responses:
 *       200:
 *         description: XLSX workbook template
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
export async function getMerchantBulkTemplate (
  _req: AuthRequest,
  res: Response
): Promise<void> {
  const workbook = createBulkMerchantTemplate()
  const buffer = await workbook.xlsx.writeBuffer()
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=merchant-onboarding-template.xlsx'
  )
  res.status(200).send(Buffer.from(buffer))
}
