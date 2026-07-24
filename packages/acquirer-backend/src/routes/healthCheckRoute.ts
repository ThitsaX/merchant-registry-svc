/* eslint-disable @typescript-eslint/no-misused-promises */
import express, { type Request, type Response } from 'express'
import { ApplicationStateEntity } from '../entity/ApplicationStateEntity'
import { AppDataSource } from '../database/dataSource'
import { authenticateJWT } from '../middleware/authenticate'
import { checkPortalUserType } from '../middleware/checkUserType'
import { PortalUserType } from 'shared-lib'
import { getEmailProvider } from '../services/email'

/**
 * @openapi
 * tags:
 *   name: Health Check
 *
 * /health-check:
 *   get:
 *     tags:
 *       - Health Check
 *     summary: Health Check
 *     responses:
 *       200:
 *         description: Health Check
 */
const router = express.Router()
router.get('/health-check', (_req: Request, res: Response) => {
  res.send({ message: 'OK' })
})

/**
 * @openapi
 * tags:
 *   name: Health Check
 *
 * /health-check/is-hubonboard-complete:
 *   get:
 *     tags:
 *       - Health Check
 *     security:
 *       - Authorization: []
 *     summary: Health Check for Hub Onboarding
 *     responses:
 *       200:
 *         description: Health Check for Hub Onboarding
 */
router.get(
  '/health-check/is-hubonboard-complete',
  authenticateJWT,
  checkPortalUserType(PortalUserType.HUB),
  async (_req: Request, res: Response) => {
    let isHubOnboardingComplete = false
    const appState = await AppDataSource.manager.findOne(ApplicationStateEntity, { where: {} })
    if (appState != null) {
      isHubOnboardingComplete = appState.is_hub_onboarding_complete
    }

    res.send({
      message: isHubOnboardingComplete ? 'Hub Onboarding is Complete' : 'Hub Onboarding is Incomplete',
      isHubOnboardingComplete
    })
  })

/**
 * @openapi
 * tags:
 *   name: Health Check
 *
 * /health-check/email-service:
 *   get:
 *     tags:
 *       - Health Check
 *     summary: Health Check
 *     responses:
 *       200:
 *         description: Health Check for the configured email provider
 */
async function emailHealthCheck (_req: Request, res: Response): Promise<void> {
  try {
    const health = await getEmailProvider().checkHealth()
    res.status(health.status === 'unhealthy' ? 503 : 200).send(health)
  } catch (error: any) {
    res.status(503).send({
      enabled: true,
      provider: process.env.EMAIL_PROVIDER ?? 'unknown',
      status: 'unhealthy',
      message: error.message
    })
  }
}

router.get('/health-check/email-service', emailHealthCheck)
// Compatibility alias for existing monitoring configurations.
router.get('/health-check/sendgrid-email-service', emailHealthCheck)

export default router
