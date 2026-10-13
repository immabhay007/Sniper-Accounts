const ACCESS_TOKEN_KEY = 'sniper.accessToken'
const REFRESH_TOKEN_KEY = 'sniper.refreshToken'
const AUTH_USER_KEY = 'sniper-accountant-user'

type AuthUserSession = {
  access_token: string
  refresh_token: string
  token_type: string
  user: {
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
}

export const tokenStorage = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  setAccessToken: (token: string): void => localStorage.setItem(ACCESS_TOKEN_KEY, token),
  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string): void => localStorage.setItem(REFRESH_TOKEN_KEY, token),
  getAuthUser: (): AuthUserSession | null => {
    const rawValue = localStorage.getItem(AUTH_USER_KEY)
    if (!rawValue) {
      return null
    }

    try {
      return JSON.parse(rawValue) as AuthUserSession
    } catch {
      return null
    }
  },
  setAuthUser: (authUser: AuthUserSession): void => localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser)),
  clear: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
  },
}
