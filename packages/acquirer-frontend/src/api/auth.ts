import instance from '@/lib/axiosInstance'
import type { LoginResponse } from '@/types/auth'

export async function login(
  email: string,
  password: string,
  recaptchaToken: string | null
) {
  const response = await instance.post<LoginResponse>('/users/login', {
    email,
    password,
    recaptchaToken,
  })
  return response.data
}

export async function logout() {
  const response = await instance.post<{ token: string }>('/users/logout')
  return response.data
}

export async function setPassword(password: string) {
  const response = await instance.put('/users/reset-password', {
    password,
  })
  return response.data
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await instance.put('/users/change-password', {
    currentPassword,
    newPassword,
  })
  return response.data
}

export async function forgotPassword(email: string) {
  const response = await instance.post('/users/forgot-password', {
    email,
  })
  return response.data
}
