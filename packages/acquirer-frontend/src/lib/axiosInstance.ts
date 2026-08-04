import axios from 'axios'
import { API_URL } from './runtimeConfig'

export const AUTH_SESSION_EXPIRED_EVENT = 'auth-session-expired'

const instance = axios.create({
  baseURL: API_URL,
})

instance.interceptors.request.use(config => {
  const token = localStorage.getItem('token')

  if (config.url === '/users/login') return config

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  if (config.url?.startsWith('/users/reset-password')) {
    const searchParams = new URLSearchParams(location.search)
    const token = searchParams.get('token')
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

instance.interceptors.response.use(
  response => response,
  error => {
    const token = localStorage.getItem('token')
    const authorization = error.config?.headers?.Authorization

    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      token &&
      authorization === `Bearer ${token}`
    ) {
      localStorage.removeItem('token')
      localStorage.removeItem('mustChangePassword')
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT))
    }

    return Promise.reject(error)
  }
)

export default instance
