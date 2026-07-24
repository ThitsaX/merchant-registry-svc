import type { PortalUserStatus, PortalUserType } from 'shared-lib'

import type { DFSP } from './merchantDetails'
import type { Role } from './roles'

export interface User {
  no: number
  name: string
  email: string
  status: string
  role: string
  dfsp: string | null
}

export type ServerUser = {
  id: number
  name: string
  email: string
  phone_number: string
  role: Role
  dfsp: DFSP
  status: PortalUserStatus
  must_change_password: boolean
  user_type: PortalUserType
  created_at: string
  updated_at: string
}

export type EmailDelivery = {
  provider: string
  status: 'disabled' | 'sent' | 'failed'
}

export type TemporaryPasswordResponse = {
  data: ServerUser
  temporaryPassword: string
  mustChangePassword: true
  emailDelivery: EmailDelivery
}
