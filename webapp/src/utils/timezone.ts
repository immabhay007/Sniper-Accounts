/**
 * Converts a UTC datetime string to the user's system timezone and returns a Date object.
 * @param utcDateTime - The UTC datetime string (e.g. '2026-05-20T10:30:00Z')
 * @param sourceTimeZone - The source timezone (e.g. 'UTC' or 'Asia/Kolkata'). If not provided, assumes 'UTC'.
 * @returns Date object in the user's local time
 */
export function convertToUserTimezone(utcDateTime: string): Date {
  // Use Intl.DateTimeFormat with timeZone option for conversion
  // This works in modern browsers
  try {
    // Parse the input as UTC
    const utcDate = new Date(utcDateTime)
    if (isNaN(utcDate.getTime())) return utcDate

    // Get user's system timezone
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Format to parts in user's timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(utcDate)

    // Extract parts
    const get = (type: string) => parts.find(p => p.type === type)?.value || '00'
    const year = get('year')
    const month = get('month')
    const day = get('day')
    const hour = get('hour')
    const minute = get('minute')
    const second = get('second')

    // Construct local date string
    const localDateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`
    return new Date(localDateStr)
  } catch {
    return new Date(utcDateTime)
  }
}

/**
 * Formats a UTC datetime string to a display string in the user's system timezone.
 * @param utcDateTime - The UTC datetime string (e.g. '2026-05-20T10:30:00Z')
 * @param sourceTimeZone - (Unused, kept for compatibility. Assumes 'UTC'.)
 * @param options - Intl.DateTimeFormat options for formatting
 * @returns Formatted string in user's local time
 */
export function formatInUserTimezone(
  utcDateTime: string,
  _sourceTimeZone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
): string {
  try {
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Ensure UTC parsing
    const normalizedDate = utcDateTime.endsWith('Z')
      ? utcDateTime
      : `${utcDateTime}Z`

    const date = new Date(normalizedDate)

    if (isNaN(date.getTime())) return utcDateTime

    return new Intl.DateTimeFormat('en-GB', {
      ...options,
      timeZone: userTimeZone,
    }).format(date)
  } catch {
    return utcDateTime
  }
}
