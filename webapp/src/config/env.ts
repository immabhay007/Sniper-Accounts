const fallbackApiBaseUrl = 'http://localhost:4000/api'

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const envApiTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS)

export const API_BASE_URL = envApiBaseUrl || fallbackApiBaseUrl
export const API_TIMEOUT_MS = Number.isFinite(envApiTimeoutMs) && envApiTimeoutMs > 0 ? envApiTimeoutMs : 60000
export const APP_NAME = 'Sniper Accountants'
