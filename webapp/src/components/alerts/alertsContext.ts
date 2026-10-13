import { createContext } from 'react'

export type AlertTone = 'success' | 'info' | 'warning' | 'error'

export type AlertsContextValue = {
  pushAlert: (message: string, tone?: AlertTone) => void
}

export const AlertsContext = createContext<AlertsContextValue | undefined>(undefined)