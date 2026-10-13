export type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom'

export const DATE_PRESET_OPTIONS: Array<{ label: string; value: DatePreset }> = [
  { label: 'Today', value: 'today' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'Custom', value: 'custom' },
]

const toDateStr = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getPresetRange = (preset: Exclude<DatePreset, 'custom'>, referenceDate = new Date()): [string, string] => {
  if (preset === 'today') {
    const today = toDateStr(referenceDate)
    return [today, today]
  }

  if (preset === 'week') {
    const start = new Date(referenceDate)
    start.setDate(referenceDate.getDate() - referenceDate.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return [toDateStr(start), toDateStr(end)]
  }

  if (preset === 'month') {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0)
    return [toDateStr(start), toDateStr(end)]
  }

  const start = new Date(referenceDate.getFullYear(), 0, 1)
  const end = new Date(referenceDate.getFullYear(), 11, 31)
  return [toDateStr(start), toDateStr(end)]
}

export const getPresetFromRange = (fromDate: string, toDate: string): DatePreset => {
  for (const preset of ['today', 'week', 'month', 'year'] as const) {
    const [presetFrom, presetTo] = getPresetRange(preset)
    if (presetFrom === fromDate && presetTo === toDate) {
      return preset
    }
  }

  return 'custom'
}
