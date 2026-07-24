export interface Decoded {
  id: number
  email: string
  iat: number
  exp: number
}

export interface LoginResponse {
  token: string
  mustChangePassword: boolean
}
