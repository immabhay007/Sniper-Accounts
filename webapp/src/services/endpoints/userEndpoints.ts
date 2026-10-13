import { api } from '../api'

export type UserRole = 'ADMIN' | 'SUPPORT'

export type UserPayload = {
  email: string
  first_name: string
  last_name: string
  phone: string
  role: string
  password: string
}

export type UserRecord = {
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

export const userEndpoints = {
  list: (userId: number) => api.get<UserRecord[]>(`/v1/users?user_id=${userId}`),
  create: (payload: UserPayload) => api.post('/v1/register-user', payload),
  update: (payload: UserPayload, id: number) => api.put(`/v1/users/${id}`, payload),
  remove: (id: number) => api.delete(`/v1/users/${id}`),
  updatePassword: (id: number, payload: { old_password: string; new_password: string }) =>
    api.put(`/v1/users/${id}/update-password`, payload),
}
