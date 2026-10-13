import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { AlertsContext, type AlertTone } from './alertsContext'

type AlertItem = {
  id: string
  message: string
  tone: AlertTone
}

const toneClassMap: Record<AlertTone, string> = {
  // Success
  success:
    'border-[#2E7D32] bg-[#4CAF50] text-white shadow-lg shadow-[#2E7D32]/40',

  // Info
  info:
    'border-sky-700 bg-sky-600 text-white shadow-lg shadow-sky-700/30',

  // Warning
  warning:
    'border-[#F59E0B] bg-[#F59E0B] text-black shadow-lg shadow-[#F59E0B]/40',

  // Error
  error:
    'border-[#c0392b] bg-[#e74c3c] text-white shadow-lg shadow-[#c0392b]/40',
}

const toneIconMap = {
  success: CheckCircle2,
  info: Info,
  warning: CircleAlert,
  error: CircleAlert,
}

export const AlertsProvider = ({ children }: { children: ReactNode }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  const pushAlert = useCallback((message: string, tone: AlertTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    setAlerts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setAlerts((current) => current.filter((alert) => alert.id !== id))
    }, 4000)
  }, [])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id))
  }, [])

  const value = useMemo(() => ({ pushAlert }), [pushAlert])

  return (
    <AlertsContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-[26rem] flex-col gap-3 px-2 sm:bottom-6 sm:right-6 sm:px-0">
        {alerts.map((alert) => {
          const Icon = toneIconMap[alert.tone]

          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 shadow-xl ${toneClassMap[alert.tone]}`}
              role="status"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 text-[15px] font-semibold leading-6">{alert.message}</p>
              <button
                type="button"
                aria-label="Dismiss alert"
                className="rounded-md p-1 text-white/90 transition hover:bg-white/15 hover:text-white"
                onClick={() => dismissAlert(alert.id)}
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          )
        })}
      </div>
    </AlertsContext.Provider>
  )
}
