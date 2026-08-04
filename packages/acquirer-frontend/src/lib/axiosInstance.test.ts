import MockAdapter from 'axios-mock-adapter'
import { vi } from 'vitest'

import instance, { AUTH_SESSION_EXPIRED_EVENT } from './axiosInstance'

describe('Axios Interceptor', () => {
  it("should set auth token if it's logged in", async () => {
    localStorage.setItem('token', 'token')

    const mock = new MockAdapter(instance)
    mock.onGet('/users/profile').reply(200, {
      id: 5,
      name: 'DFSP 1 Admin 1',
    })

    const response = await instance.get('/users/profile')

    expect(response.config.headers.Authorization).toBeTruthy()
  })

  it('should not set auth token when the API route is "/users/login"', async () => {
    const mock = new MockAdapter(instance)
    mock.onPost('/users/login').reply(200, { token: 'token' })

    const response = await instance.post('/users/login', {
      email: 'john@gmail.com',
      password: 'password',
    })

    expect(response.config.headers.Authorization).toBeFalsy()
  })

  it('should set auth token when the API route is "/users/reset-password"', async () => {
    const mock = new MockAdapter(instance)
    mock.onPut('/users/reset-password').reply(200)

    const response = await instance.put('/users/reset-password', {
      password: 'password',
    })

    expect(response.config.headers.Authorization).toBeTruthy()
  })

  it('clears and expires a rejected authenticated session', async () => {
    localStorage.setItem('token', 'revoked-token')
    localStorage.setItem('mustChangePassword', 'true')
    const onSessionExpired = vi.fn()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)

    const mock = new MockAdapter(instance)
    mock.onPut('/users/change-password').reply(401, {
      message: 'Authorization Failed',
    })

    await expect(
      instance.put('/users/change-password', {
        currentPassword: 'Temporary_234A',
        newPassword: 'new-password-234',
      })
    ).rejects.toMatchObject({ response: { status: 401 } })

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('mustChangePassword')).toBeNull()
    expect(onSessionExpired).toHaveBeenCalledTimes(1)

    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)
  })

  it('does not expire a session when a password-reset link token is rejected', async () => {
    localStorage.setItem('token', 'current-session-token')
    window.history.replaceState({}, '', '/set-password?token=reset-link-token')
    const onSessionExpired = vi.fn()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)

    const mock = new MockAdapter(instance)
    mock.onPut('/users/reset-password').reply(401, {
      message: 'Authorization Failed',
    })

    await expect(
      instance.put('/users/reset-password', { password: 'new-password-234' })
    ).rejects.toMatchObject({ response: { status: 401 } })

    expect(localStorage.getItem('token')).toBe('current-session-token')
    expect(onSessionExpired).not.toHaveBeenCalled()

    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)
  })
})
