import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL, API_TIMEOUT_MS } from '../config/env'
import { tokenStorage } from '../utils/storage'

type RetryableAxiosRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

const methodsWithBody = new Set(['post', 'put', 'patch'])
const REFRESH_TOKEN_PATH = '/v1/auth/refresh-token'

const isRefreshRequest = (config?: AxiosRequestConfig): boolean => {
  const url = config?.url ?? ''
  return typeof url === 'string' && (url.includes(REFRESH_TOKEN_PATH) || url.includes(`/api${REFRESH_TOKEN_PATH}`))
}

const redirectToLogin = () => {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const accessToken = tokenStorage.getAccessToken()
  const requestConfig = config

  if (accessToken) {
    requestConfig.headers.Authorization = `Bearer ${accessToken}`
  }

  if (requestConfig.method && methodsWithBody.has(requestConfig.method.toLowerCase())) {
    requestConfig.headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  return requestConfig
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableAxiosRequestConfig | undefined

    if (!originalRequest || originalRequest._retry || isRefreshRequest(originalRequest)) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401) {
      const refreshToken = tokenStorage.getRefreshToken()

      if (!refreshToken) {
        tokenStorage.clear()
        redirectToLogin()
        return Promise.reject(error)
      }

      originalRequest._retry = true

      try {
        const refreshResponse = await axios.post(`${API_BASE_URL}${REFRESH_TOKEN_PATH}`, {
          refresh_token: refreshToken,
        })
        const nextToken = (refreshResponse.data?.access_token ?? refreshResponse.data?.accessToken) as string | undefined
        const nextRefreshToken = (refreshResponse.data?.refresh_token ??
          refreshResponse.data?.refreshToken) as string | undefined

        if (!nextToken) {
          throw new Error('Missing access token after refresh')
        }

        tokenStorage.setAccessToken(nextToken)
        if (nextRefreshToken) {
          tokenStorage.setRefreshToken(nextRefreshToken)
        }

        originalRequest.headers.Authorization = `Bearer ${nextToken}`
        return api(originalRequest)
      } catch (refreshError) {
        tokenStorage.clear()
        redirectToLogin()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)
