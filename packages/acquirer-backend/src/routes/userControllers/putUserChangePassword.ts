import bcrypt from 'bcrypt'
import { type Response } from 'express'
import {
  AuditActionType,
  AuditTrasactionStatus,
  PortalUserStatus
} from 'shared-lib'
import * as z from 'zod'
import { AppDataSource } from '../../database/dataSource'
import { JwtTokenEntity } from '../../entity/JwtTokenEntity'
import logger from '../../services/logger'
import { type AuthRequest } from '../../types/express'
import { audit } from '../../utils/audit'
import { hashPassword } from '../../utils/utils'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8)
})

/**
 * @openapi
 * /users/change-password:
 *   put:
 *     tags:
 *       - Portal Users
 *     summary: Replace the authenticated user's current or temporary password
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password changed and all sessions revoked
 *       400:
 *         description: Current password is incorrect
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export async function putUserChangePassword (req: AuthRequest, res: Response) {
  const user = req.user
  if (user == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  const result = ChangePasswordSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(422).send({
      message: 'Validation error',
      errors: result.error.flatten()
    })
  }

  const { currentPassword, newPassword } = result.data

  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).send({ message: 'Current password is incorrect' })
  }

  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(422).send({
      message: 'New password must be different from the current password'
    })
  }

  try {
    user.password = await hashPassword(newPassword)
    user.must_change_password = false
    if (user.status === PortalUserStatus.RESETPASSWORD) {
      user.status = PortalUserStatus.ACTIVE
    }

    await AppDataSource.manager.transaction(async transactionalEntityManager => {
      await transactionalEntityManager.save(user)
      await transactionalEntityManager.delete(JwtTokenEntity, {
        user: { id: user.id }
      })
    })

    try {
      await audit(
        AuditActionType.UPDATE,
        AuditTrasactionStatus.SUCCESS,
        'putUserChangePassword',
        'User changed password',
        'PortalUserEntity',
        { must_change_password: true },
        { must_change_password: false },
        user
      )
    } catch (error) {
      logger.error('Could not write password-change audit: %o', error)
    }

    return res.status(200).send({
      message: 'Password changed. Please log in again.'
    })
  } catch (error) {
    logger.error('Change password failed: %o', error)
    return res.status(500).send({ message: 'Change password failed' })
  }
}
