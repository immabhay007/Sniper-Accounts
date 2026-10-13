import { api } from '../api'

export type LoginPayload = {
  email: string
  password: string
}

export type LoginUser = {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  role: string
  is_active: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  full_name: string
}

export type LoginResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  user: LoginUser
}

export type ForgotPasswordPayload = {
  email: string
}

export type VerifyOtpPayload = {
  otp: string
}

export type UpdateWithOtpPayload = {
  otp: string
  new_password: string
}

export const authEndpoints = {
  login: (payload: LoginPayload) => api.post<LoginResponse>('/v1/auth/login', payload),
  forgotPassword: (payload: ForgotPasswordPayload) => api.post('/v1/users/forgot-password', payload),
  resetPassword: (payload: VerifyOtpPayload) => api.post('/v1/users/reset-password', payload),
  updateWithOtp: (payload: UpdateWithOtpPayload) => api.put('/v1/users/reset-password/update-with-otp', payload),
  logout: () => api.post('/v1/auth/logout'),
}
