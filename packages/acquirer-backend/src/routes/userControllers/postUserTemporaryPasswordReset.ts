import { type Response } from 'express'
import {
  AuditActionType,
  AuditTrasactionStatus,
  PortalUserStatus,
  PortalUserType
} from 'shared-lib'
import { AppDataSource } from '../../database/dataSource'
import { JwtTokenEntity } from '../../entity/JwtTokenEntity'
import { PortalUserEntity } from '../../entity/PortalUserEntity'
import {
  roleCreationPermissions
} from '../../middleware/checkUserCreationPermission'
import {
  sendTemporaryPasswordResetNotification
} from '../../services/email'
import logger from '../../services/logger'
import { generateTemporaryPassword } from '../../services/tempPassword'
import { type AuthRequest } from '../../types/express'
import { audit } from '../../utils/audit'
import { hashPassword } from '../../utils/utils'

/**
 * @openapi
 * /users/{user_id}/reset-password:
 *   post:
 *     tags:
 *       - Portal Users
 *     summary: Generate a one-time temporary password for a user
 *     security:
 *       - Authorization: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Temporary password generated and returned once
 *       403:
 *         description: Insufficient permission for the target user's role
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export async function postUserTemporaryPasswordReset (
  req: AuthRequest,
  res: Response
) {
  const administrator = req.user
  if (administrator == null) {
    return res.status(401).send({ message: 'Unauthorized' })
  }

  const userId = Number(req.params.user_id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(422).send({ message: 'Invalid ID' })
  }

  if (administrator.id === userId) {
    return res.status(422).send({ message: 'Cannot reset your own password' })
  }

  const user = await AppDataSource.manager.findOne(PortalUserEntity, {
    where: { id: userId },
    relations: ['dfsp', 'role']
  })

  if (user == null) {
    return res.status(404).send({ message: 'User Not Found' })
  }

  if (
    administrator.user_type === PortalUserType.DFSP &&
    (administrator.dfsp == null ||
      user.dfsp == null ||
      administrator.dfsp.id !== user.dfsp.id)
  ) {
    return res.status(403).send({ message: 'Insufficient permissions' })
  }

  const requiredRolePermission = roleCreationPermissions[user.role.name]
  const administratorPermissions = administrator.role.permissions.map(
    permission => permission.name
  )
  if (
    requiredRolePermission == null ||
    !administratorPermissions.includes(requiredRolePermission)
  ) {
    return res.status(403).send({
      message: 'Insufficient permissions to reset this role.'
    })
  }

  if (user.status === PortalUserStatus.BLOCKED) {
    return res.status(422).send({ message: 'Cannot reset a blocked user' })
  }

  try {
    const temporaryPassword = generateTemporaryPassword()
    user.password = await hashPassword(temporaryPassword)
    user.must_change_password = true

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
        'postUserTemporaryPasswordReset',
        'Temporary password reset by administrator',
        'PortalUserEntity',
        {},
        {
          user_id: user.id,
          must_change_password: true
        },
        administrator
      )
    } catch (error) {
      logger.error('Could not write temporary-password-reset audit: %o', error)
    }

    const emailDelivery = await sendTemporaryPasswordResetNotification({
      to: user.email,
      name: user.name
    })

    return res.status(200).send({
      message: 'Temporary password generated',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        must_change_password: user.must_change_password
      },
      temporaryPassword,
      mustChangePassword: true,
      emailDelivery
    })
  } catch (error) {
    logger.error('Temporary password reset failed: %o', error)
    return res.status(500).send({ message: 'Temporary password reset failed' })
  }
}
