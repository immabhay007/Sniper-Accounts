export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export const formatDate = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export const getSystemTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

export const formatDateTime = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}
