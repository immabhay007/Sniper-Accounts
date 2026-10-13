import { useContext } from 'react'
import { AlertsContext } from './alertsContext'

export const useAlerts = () => {
  const context = useContext(AlertsContext)

  if (!context) {
    throw new Error('useAlerts must be used within AlertsProvider')
  }

  return context
}