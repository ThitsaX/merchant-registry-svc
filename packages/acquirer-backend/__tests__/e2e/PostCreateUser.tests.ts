/* eslint-disable max-len */
import bcrypt from 'bcrypt'
import request from 'supertest'
import { type Application } from 'express'
import { DefaultDFSPUsers, DefaultHubUsers } from '../../src/database/defaultUsers'
import { AppDataSource } from '../../src/database/dataSource'
import { DFSPEntity } from '../../src/entity/DFSPEntity'
import { PortalUserEntity } from '../../src/entity/PortalUserEntity'
import { PortalUserStatus } from 'shared-lib'
import { PortalPermissionEntity } from '../../src/entity/PortalPermissionEntity'
import { PermissionsEnum } from '../../src/types/permissions'
import { PortalRoleEntity } from '../../src/entity/PortalRoleEntity'

export function testPostCreateUser (app: Application): void {
  let hubUserToken = ''
  const hubUserEmail = DefaultHubUsers[0].email
  const hubUserPwd = DefaultHubUsers[0].password
  let hubUserRole: PortalRoleEntity
  let createDfspAdminPermission: PortalPermissionEntity
  let createPortalUserPermission: PortalPermissionEntity

  let validDfspId = 0

  let dfspUserToken = ''
  const dfspUserEmail = DefaultDFSPUsers[0].email
  const dfspUserPwd = DefaultDFSPUsers[0].password
  let dfspUserRole: PortalRoleEntity
  let dfspCreateDfspOperatorPermission: PortalPermissionEntity
  let dfspCreatePortalUserPermission: PortalPermissionEntity

  const dfspAdminRoleName = 'DFSP Admin'

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: hubUserEmail,
        password: hubUserPwd
      })
    hubUserToken = res.body.token

    // Hub User should have CREATE_PORTAL_USERS and CREATE_DFSP_ADMIN permissions
    hubUserRole = await AppDataSource.manager.findOneOrFail(PortalRoleEntity, { where: { name: DefaultHubUsers[0].role }, relations: ['permissions'] })
    createPortalUserPermission = await AppDataSource.manager.findOneOrFail(PortalPermissionEntity, { where: { name: PermissionsEnum.CREATE_PORTAL_USERS } })
    createDfspAdminPermission = await AppDataSource.manager.findOneOrFail(PortalPermissionEntity, { where: { name: PermissionsEnum.CREATE_DFSP_ADMIN } })
    hubUserRole.permissions.push(createPortalUserPermission)
    hubUserRole.permissions.push(createDfspAdminPermission)
    await AppDataSource.manager.save(hubUserRole)

    const res2 = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: dfspUserEmail,
        password: dfspUserPwd
      })
    dfspUserToken = res2.body.token

    const dfsp = await AppDataSource.manager.findOne(DFSPEntity, { where: { name: DefaultDFSPUsers[0].dfsp_name } })
    validDfspId = dfsp?.id as number

    // DFSP Admin should have CREATE_PORTAL_USERS and CREATE_DFSP_OPERATOR
    dfspUserRole = await AppDataSource.manager.findOneOrFail(PortalRoleEntity, { where: { name: dfspAdminRoleName }, relations: ['permissions'] })
    dfspCreatePortalUserPermission = await AppDataSource.manager.findOneOrFail(PortalPermissionEntity, { where: { name: PermissionsEnum.CREATE_PORTAL_USERS } })
    dfspCreateDfspOperatorPermission = await AppDataSource.manager.findOneOrFail(PortalPermissionEntity, { where: { name: PermissionsEnum.CREATE_DFSP_OPERATOR } })
    dfspUserRole.permissions.push(dfspCreatePortalUserPermission)
    dfspUserRole.permissions.push(dfspCreateDfspOperatorPermission)
    await AppDataSource.manager.save(dfspUserRole)
  })

  it('should respond with 401 when Authorization header is missing', async () => {
    const res = await request(app).post('/api/v1/users/add')
    expect(res.statusCode).toEqual(401)
    expect(res.body.message).toEqual('Authorization Failed')
  })

  it('should respond with 401 when Authorization token is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', 'Bearer invalid_token')
    expect(res.statusCode).toEqual(401)
    expect(res.body.message).toEqual('Authorization Failed')
  })

  it('should respond with 422 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        // name is omitted
        email: 'test@example.com',
        role: dfspAdminRoleName,
        dfsp_id: validDfspId
      })

    expect(res.statusCode).toEqual(422)
    expect(res.body.message).toContain('Validation error')
    expect(res.body.errors).toHaveProperty('fieldErrors')
    expect(res.body.errors.fieldErrors).toHaveProperty('name')
  })

  it('should respond with 422 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        name: 'Test User',
        email: 'not-an-email', // Invalid email format
        role: dfspAdminRoleName,
        dfsp_id: validDfspId
      })

    expect(res.statusCode).toEqual(422)
    expect(res.body.message).toContain('Validation error')
    expect(res.body.errors).toHaveProperty('fieldErrors')
    expect(res.body.errors.fieldErrors).toHaveProperty('email')
  })

  it('should respond with 422 when role is missing', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        name: 'Test User',
        email: 'test@example.com',
        // role is omitted
        dfsp_id: validDfspId
      })

    expect(res.statusCode).toEqual(400)
    expect(res.body.message).toContain('Invalid role')
  })

  it('should respond with 400 when role is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        name: 'Test User',
        email: 'super-user-222@example.com',
        role: 'invalid-role', // Invalid role
        dfsp_id: validDfspId
      })

    expect(res.statusCode).toEqual(400)
    expect(res.body.message).toEqual('Invalid role')
  })

  it('should respond with 400 when email already exists', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        name: 'Test User',
        email: DefaultHubUsers[0].email,
        role: dfspAdminRoleName,
        dfsp_id: validDfspId
      })

    expect(res.statusCode).toEqual(400)
    expect(res.body.message).toEqual('Email already exists')
  })

  it('should fails when creating a user from hub admin with invalid dfspid', async () => {
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        name: 'Test User 33',
        email: 'new-user-33@example.com',
        role: dfspAdminRoleName,
        dfsp_id: 9999999 // if it's a HUB user
      })
    expect(res.statusCode).toEqual(400)
    expect(res.body.message).toEqual('Invalid dfsp_id: DFSP Not found')
  })

  it('should create a user with a one-time temporary password and enforce its replacement', async () => {
    // Arrange
    await AppDataSource.manager.delete(PortalUserEntity, { email: 'new-user@example.com' })

    // Act
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${hubUserToken}`)
      .send({
        name: 'Test User',
        email: 'new-user@example.com',
        role: dfspAdminRoleName,
        dfsp_id: validDfspId // if it's a HUB user
      })

    // Assert
    expect(res.statusCode).toEqual(201)
    expect(res.body.message).toEqual('User created')
    expect(res.body.data).toHaveProperty('id')

    expect(res.body.data).toHaveProperty('name')
    expect(res.body.data.name).toEqual('Test User')

    expect(res.body.data).toHaveProperty('email')
    expect(res.body.data.email).toEqual('new-user@example.com')
    expect(res.body.data.status).toEqual(PortalUserStatus.ACTIVE)
    expect(res.body.data.must_change_password).toBe(true)
    expect(res.body.data).not.toHaveProperty('password')
    expect(res.body.temporaryPassword).toHaveLength(16)
    expect(res.body.mustChangePassword).toBe(true)
    expect(res.body.emailDelivery).toEqual({
      provider: 'none',
      status: 'disabled'
    })

    const storedUser = await AppDataSource.manager.findOneOrFail(PortalUserEntity, {
      where: { id: res.body.data.id }
    })
    expect(await bcrypt.compare(res.body.temporaryPassword, storedUser.password)).toBe(true)

    const loginWithTemporaryPassword = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: 'new-user@example.com',
        password: res.body.temporaryPassword
      })
    expect(loginWithTemporaryPassword.statusCode).toBe(200)
    expect(loginWithTemporaryPassword.body.mustChangePassword).toBe(true)

    const blockedRequest = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${loginWithTemporaryPassword.body.token}`)
    expect(blockedRequest.statusCode).toBe(403)
    expect(blockedRequest.body.code).toBe('PASSWORD_CHANGE_REQUIRED')

    const changedPassword = 'a-new-secure-password'
    const changeResponse = await request(app)
      .put('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${loginWithTemporaryPassword.body.token}`)
      .send({
        currentPassword: res.body.temporaryPassword,
        newPassword: changedPassword
      })
    expect(changeResponse.statusCode).toBe(200)

    const revokedTokenRequest = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${loginWithTemporaryPassword.body.token}`)
    expect(revokedTokenRequest.statusCode).toBe(401)

    const loginWithChangedPassword = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: 'new-user@example.com',
        password: changedPassword
      })
    expect(loginWithChangedPassword.statusCode).toBe(200)
    expect(loginWithChangedPassword.body.mustChangePassword).toBe(false)

    const adminResetResponse = await request(app)
      .post(`/api/v1/users/${res.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${hubUserToken}`)
    expect(adminResetResponse.statusCode).toBe(200)
    expect(adminResetResponse.body.temporaryPassword).toHaveLength(16)
    expect(adminResetResponse.body.emailDelivery.status).toBe('disabled')

    const oldPasswordLogin = await request(app)
      .post('/api/v1/users/login')
      .send({
        email: 'new-user@example.com',
        password: changedPassword
      })
    expect(oldPasswordLogin.statusCode).toBe(400)

    // Clean up
    await AppDataSource.query('PRAGMA foreign_keys = OFF;')
    await AppDataSource.manager.delete(PortalUserEntity, { id: res.body.data.id })
    await AppDataSource.query('PRAGMA foreign_keys = ON;')
  })

  it('should successfully create a user from dfsp admin without requiring email', async () => {
    // Arrange
    const newDfspOperatorEmail = 'new-dfsp-operator-user@example.com'
    await AppDataSource.manager.delete(PortalUserEntity, { email: newDfspOperatorEmail })

    // Act
    const res = await request(app)
      .post('/api/v1/users/add')
      .set('Authorization', `Bearer ${dfspUserToken}`)
      .send({
        name: 'Test User 2',
        email: newDfspOperatorEmail,
        role: 'DFSP Operator'
      })

    // Assert
    expect(res.statusCode).toEqual(201)
    expect(res.body.message).toEqual('User created')
    expect(res.body.data).toHaveProperty('id')

    expect(res.body.data).toHaveProperty('name')
    expect(res.body.data.name).toEqual('Test User 2')

    expect(res.body.data).toHaveProperty('email')
    expect(res.body.data.email).toEqual(newDfspOperatorEmail)

    expect(res.body.data.status).toEqual(PortalUserStatus.ACTIVE)
    expect(res.body.data.must_change_password).toBe(true)
    expect(res.body.emailDelivery.status).toBe('disabled')

    // Clean up
    await AppDataSource.query('PRAGMA foreign_keys = OFF;')
    await AppDataSource.manager.delete(PortalUserEntity, { email: newDfspOperatorEmail })
    await AppDataSource.query('PRAGMA foreign_keys = ON;')
  })
}
