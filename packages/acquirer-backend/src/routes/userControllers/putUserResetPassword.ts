import { type Response } from 'express'
import logger from '../../services/logger'
import { audit } from '../../utils/audit'
import { AppDataSource } from '../../database/dataSource'
import {
  AuditActionType,
  AuditTrasactionStatus,
  PortalUserStatus
} from 'shared-lib'
import { hashPassword } from '../../utils/utils'
import { type AuthRequest } from '../../types/express'
import { JwtTokenEntity } from '../../entity/JwtTokenEntity'
import * as z from 'zod'

const ResetPasswordSchema = z.object({
  password: z.string().min(8)
})

/**
 * @openapi
 * /users/reset-password:
 *   put:
 *     tags:
 *       - Portal Users
 *     summary: Reset Password
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 example: "password"
 *     responses:
 *       200:
 *         description: Reset Password Successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Reset Password Successful"
 *       400:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid credentials"
 *
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export async function putUserResetPassword (req: AuthRequest, res: Response) {
  const portalUser = req.user

  /* istanbul ignore if  */
  if (portalUser == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  const result = ResetPasswordSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(422).send({
      message: 'Validation error',
      errors: result.error.flatten()
    })
  }

  const { password } = result.data

  try {
    portalUser.password = await hashPassword(password)
    portalUser.must_change_password = false
    if (portalUser.status === PortalUserStatus.RESETPASSWORD) {
      portalUser.status = PortalUserStatus.ACTIVE
    }
    await AppDataSource.manager.transaction(async transactionalEntityManager => {
      await transactionalEntityManager.save(portalUser)
      await transactionalEntityManager.delete(JwtTokenEntity, {
        user: { id: portalUser.id }
      })
    })

    try {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.SUCCESS,
        'putUserResetPassword',
        'Reset User Password Successful',
        'PortalUserEntity',
        {},
        { user_id: portalUser.id, must_change_password: false },
        portalUser
      )
    } catch (error) {
      logger.error('Could not write password-reset audit: %o', error)
    }

    return res.status(201).send({ message: 'Reset Password Successful' })
  } catch (error) /* istanbul ignore next */ {
    await audit(
      AuditActionType.ACCESS,
      AuditTrasactionStatus.FAILURE,
      'putUserResetPassword',
      'Reset User Password Failed',
      'PortalUserEntity',
      {}, {}, null
    )

    logger.error('%o', error)
    return res
      .status(500)
      .send({ message: error })
  }
}
