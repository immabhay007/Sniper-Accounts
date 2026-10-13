import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import JSZip from 'jszip'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Download, FileDown, PencilLine, Plus, Trash2 } from 'lucide-react'
import { AppTable } from '../components/AppTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { SectionHeader } from '../components/SectionHeader'
import { SectionLoader } from '../components/SectionLoader'
import { useAlerts } from '../components/alerts/useAlerts'
import { usePageHeaderActions } from '../layout/pageHeaderActionsContext'
import { api } from '../services/api'
import { expenseEndpoints, type ExpensePayload, type ExpenseRecord } from '../services/endpoints/expenseEndpoints'
import { fundDepositEndpoints, type FundDepositAccountOption } from '../services/endpoints/fundDepositEndpoints'
import { DATE_PRESET_OPTIONS, getPresetFromRange, getPresetRange, type DatePreset } from '../utils/dateFilters'
import { formatCurrency, formatDate, getSystemTimezone } from '../utils/format'
import { tokenStorage } from '../utils/storage'
import { formatInUserTimezone } from '../utils/timezone'

const getCurrentUserId = (): number => {
  try {
    const authUser = tokenStorage.getAuthUser()
    return authUser?.user?.id ?? 0
  } catch {
    return 0
  }
}

const listUserId = 0

type ExpenseFormState = {
  fund_account_id: string
  date_of_expense: string
  purpose: string
  withdrawn_amount: string
  returned_amount: string
  running_balance: string
  category_tage: string
  payment_by: string
  created_by: string
  updated_by: string
  updated_at: string
  bill_url: string
}

const getCurrentTimestamp = (): string => new Date().toISOString()

const displayDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

const toIsoTimestamp = (value: string): string => {
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? getCurrentTimestamp() : parsedDate.toISOString()
}

const getFileNameFromUrl = (url: string, fallbackName: string): string => {
  const sanitizeFileName = (value: string): string => {
    const cleaned = value.replace(/[<>:"/\\|?*]/g, '_').replaceAll(/\p{Cc}/gu, '_').trim()
    if (!cleaned) return fallbackName

    if (cleaned.length <= 120) {
      return cleaned
    }

    const extensionIndex = cleaned.lastIndexOf('.')
    if (extensionIndex > 0 && extensionIndex >= cleaned.length - 10) {
      const extension = cleaned.slice(extensionIndex)
      const baseName = cleaned.slice(0, 120 - extension.length)
      return `${baseName}${extension}`
    }

    return cleaned.slice(0, 120)
  }

  try {
    if (url.startsWith('data:')) {
      return sanitizeFileName(fallbackName)
    }

    const pathname = new URL(url).pathname
    const fileName = pathname.split('/').filter(Boolean).pop()
    return fileName ? sanitizeFileName(decodeURIComponent(fileName)) : sanitizeFileName(fallbackName)
  } catch {
    return sanitizeFileName(fallbackName)
  }
}

type ExpenseBillRecord = NonNullable<ExpenseRecord['bills']>[number]

const parseBase64Bill = (value: string): { mimeType: string; base64: string } | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || 'application/octet-stream',
      base64: dataUrlMatch[2],
    }
  }

  const looksLikeUrl = /^(https?:\/\/|blob:|\/)/i.test(trimmed)
  if (looksLikeUrl) {
    return null
  }

  const normalized = trimmed.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized) || normalized.length < 32) {
    return null
  }

  return {
    mimeType: normalized.startsWith('JVBER') ? 'application/pdf' : 'application/octet-stream',
    base64: normalized,
  }
}

const getBillPayload = (bill: ExpenseBillRecord): string | null => {
  const preferredKeys = ['bill_base64', 'base64', 'bill_data', 'file_data', 'data', 'content', 'bill_content', 'bill_url']

  for (const key of preferredKeys) {
    const value = bill[key]
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (!normalized) continue
    if (parseBase64Bill(normalized)) {
      return normalized
    }
  }

  for (const value of Object.values(bill)) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (!normalized) continue
    if (parseBase64Bill(normalized)) {
      return normalized
    }
  }

  return null
}

const getBillFileName = (bill: ExpenseBillRecord, fallbackName: string): string => {
  const possibleNames = ['file_name', 'filename', 'name', 'original_name', 'original_filename']

  for (const key of possibleNames) {
    const value = bill[key]
    if (typeof value === 'string' && value.trim()) {
      return getFileNameFromUrl(value, fallbackName)
    }
  }

  const billUrl = typeof bill.bill_url === 'string' ? bill.bill_url : ''
  return getFileNameFromUrl(billUrl, fallbackName)
}

const base64ToBlob = (base64Value: string, mimeType: string): Blob => {
  const binary = window.atob(base64Value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

const fetchFileBlob = async (source: string, allowNetworkFetch = true): Promise<Blob> => {
  const trimmed = source.trim()
  const base64Bill = parseBase64Bill(trimmed)
  if (base64Bill) {
    return base64ToBlob(base64Bill.base64, base64Bill.mimeType)
  }

  if (!allowNetworkFetch || trimmed.startsWith('data:')) {
    throw new Error('Bill payload did not contain valid base64 data.')
  }

  try {
    // Use shared API client so relative URLs and auth-protected files work.
    const response = await api.get<Blob>(trimmed, { responseType: 'blob' })
    return response.data
  } catch {
    const response = await fetch(trimmed)

    if (!response.ok) {
      throw new Error(`Failed to download file from ${trimmed}`)
    }

    return response.blob()
  }
}

const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = fileName
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000)
}

type ReportRow = {
  no: number
  fund_account: string
  date_of_expense: string
  purpose: string
  withdrawn_amount: string
  returned_amount: string
  running_balance: string
  category_tage: string
  payment_by: string
}

const buildReportRows = (expenses: import('../services/endpoints/expenseEndpoints').ExpenseRecord[]): ReportRow[] =>
  expenses.map((expense, index) => ({
    no: index + 1,
    fund_account: expense.fund_account ?? '-',
    date_of_expense: formatDate(expense.date_of_expense),
    purpose: expense.purpose,
    withdrawn_amount: formatCurrency(Number(expense.withdrawn_amount || 0)),
    returned_amount: formatCurrency(Number(expense.returned_amount || 0)),
    running_balance: formatCurrency(Number(expense.running_balance || 0)),
    category_tage: expense.category_tage,
    payment_by: expense.payment_by,
  }))

const getDateRange = (
  expenses: import('../services/endpoints/expenseEndpoints').ExpenseRecord[],
): string => {
  if (expenses.length === 0) return '-'
  const timestamps = expenses
    .map((e) => new Date(e.date_of_expense).getTime())
    .filter((t) => !Number.isNaN(t))
  if (timestamps.length === 0) return '-'
  const min = new Date(Math.min(...timestamps))
  const max = new Date(Math.max(...timestamps))
  const fmt = (d: Date) => formatDate(d.toISOString())
  return min.getTime() === max.getTime() ? fmt(min) : `${fmt(min)} – ${fmt(max)}`
}

const getLatestRunningBalanceTotal = (
  expenseRecords: import('../services/endpoints/expenseEndpoints').ExpenseRecord[],
): number => {
  const latestByFundAccount = new Map<number, import('../services/endpoints/expenseEndpoints').ExpenseRecord>()

  expenseRecords.forEach((expense) => {
    const fundAccountId = Number(expense.fund_account_id)

    if (!Number.isFinite(fundAccountId)) {
      return
    }

    const existing = latestByFundAccount.get(fundAccountId)

    if (!existing) {
      latestByFundAccount.set(fundAccountId, expense)
      return
    }

    const currentTimestamp = new Date(expense.date_of_expense).getTime()
    const existingTimestamp = new Date(existing.date_of_expense).getTime()

    if (currentTimestamp > existingTimestamp) {
      latestByFundAccount.set(fundAccountId, expense)
      return
    }

    if (currentTimestamp === existingTimestamp && expense.id > existing.id) {
      latestByFundAccount.set(fundAccountId, expense)
    }
  })

  return Array.from(latestByFundAccount.values()).reduce(
    (sum, expense) => sum + Number(expense.running_balance || 0),
    0,
  )
}

const slugifyReportRange = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'report'
}

const TABLE_HEADERS = ['No.', 'Fund Account', 'Date of Expense', 'Purpose', 'Withdrawn', 'Returned', 'Running Balance', 'Category Tag', 'Payment By']
const TABLE_KEYS: (keyof ReportRow)[] = ['no', 'fund_account', 'date_of_expense', 'purpose', 'withdrawn_amount', 'returned_amount', 'running_balance', 'category_tage', 'payment_by']

const getEmptyFormState = (): ExpenseFormState => ({
  fund_account_id: '',
  date_of_expense: getCurrentTimestamp(),
  purpose: '',
  withdrawn_amount: '',
  returned_amount: '',
  running_balance: '',
  category_tage: '',
  payment_by: '',
  created_by: String(getCurrentUserId()),
  updated_by: String(getCurrentUserId()),
  updated_at: getCurrentTimestamp(),
  bill_url: '',
})

const toPayload = (formState: ExpenseFormState): ExpensePayload => ({
  fund_account_id: Number(formState.fund_account_id || 0),
  date_of_expense: toIsoTimestamp(formState.date_of_expense),
  purpose: String(formState.purpose ?? '').trim(),
  withdrawn_amount: Number(formState.withdrawn_amount || 0),
  returned_amount: Number(formState.returned_amount || 0),
  running_balance: Number(formState.running_balance || 0),
  category_tage: String(formState.category_tage ?? '').trim(),
  payment_by: String(formState.payment_by ?? '').trim(),
  created_by: Number(formState.created_by || 0),
  updated_by: Number(formState.updated_by || 0),
  updated_at: toIsoTimestamp(formState.updated_at),
  bill_url: String(formState.bill_url ?? '').trim(),
  timezone: getSystemTimezone(),
})

const collectExpenseBillFiles = async (records: ExpenseRecord[]) => {
  const billTasks = records.flatMap((expense) =>
    (expense.bills ?? []).map(async (bill, index) => {
      const payload = getBillPayload(bill)
      if (!payload) {
        throw new Error(`Expense ${expense.id} bill ${index + 1} is missing base64 bill data.`)
      }

      // Determine file extension from mime type
      let ext = 'bin'
      const parsed = parseBase64Bill(payload)
      if (parsed) {
        if (parsed.mimeType === 'application/pdf') ext = 'pdf'
        else if (parsed.mimeType === 'image/png') ext = 'png'
        else if (parsed.mimeType === 'image/jpeg') ext = 'jpg'
        else if (parsed.mimeType === 'image/webp') ext = 'webp'
        else if (parsed.mimeType === 'image/jpg') ext = 'jpg'
      } else {
        // Try to infer from url
        const url = typeof bill.bill_url === 'string' ? bill.bill_url : ''
        const match = url.match(/\.([a-zA-Z0-9]+)(\?|$)/)
        if (match) ext = match[1].toLowerCase()
      }

      const blob = await fetchFileBlob(payload, false)
      let fileName = getBillFileName(bill, `expense-${expense.id}-bill-${index + 1}.${ext}`)
      // If fallback name doesn't have extension, add it
      if (!fileName.match(/\.[a-zA-Z0-9]+$/)) fileName += `.${ext}`
      return {
        blob,
        fileName,
        expenseId: expense.id,
        index,
      }
    }),
  )

  const results = await Promise.allSettled(billTasks)

  return results.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [result.value]
    }

    console.warn('Skipping expense bill while building ZIP', result.reason)
    return []
  })
}

export const ExpensesPage = () => {
  const { pushAlert } = useAlerts()
  const { setActions } = usePageHeaderActions()
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [fromDate, setFromDate] = useState<string>(() => getPresetRange('month')[0])
  const [toDate, setToDate] = useState<string>(() => getPresetRange('month')[1])
  const [isFilterModalOpen, setFilterModalOpen] = useState(false)
  const [filterPreset, setFilterPreset] = useState<DatePreset>('month')
  const [filterFromDate, setFilterFromDate] = useState<string>(fromDate)
  const [filterToDate, setFilterToDate] = useState<string>(toDate)
  const [filterFundAmount, setFilterFundAmount] = useState<string>('')
  const [filterCategoryType, setFilterCategoryType] = useState<string>('')
  const [filterPaymentBy, setFilterPaymentBy] = useState<string>('')
  const [appliedFundAmount, setAppliedFundAmount] = useState<string>('')
  const [appliedCategoryType, setAppliedCategoryType] = useState<string>('')
  const [appliedPaymentBy, setAppliedPaymentBy] = useState<string>('')
  const [fundAccountOptions, setFundAccountOptions] = useState<FundDepositAccountOption[]>([])
  const [isFundOptionsLoading, setFundOptionsLoading] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const [isAddModalOpen, setAddModalOpen] = useState(false)
  const [latestRunningBalance, setLatestRunningBalance] = useState(0)
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [downloadingExpenseId, setDownloadingExpenseId] = useState<number | null>(null)
  const [isReportMenuOpen, setReportMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const reportMenuRef = useRef<HTMLDivElement>(null)
  const reportBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isReportMenuOpen) return
    const rect = reportBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuPosition({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right,
      })
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        reportBtnRef.current &&
        !reportBtnRef.current.contains(e.target as Node) &&
        reportMenuRef.current &&
        !reportMenuRef.current.contains(e.target as Node)
      ) {
        setReportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isReportMenuOpen])
  const [formState, setFormState] = useState<ExpenseFormState>(() => getEmptyFormState())
  const [addFormState, setAddFormState] = useState<ExpenseFormState>(() => getEmptyFormState())
  const [editFiles, setEditFiles] = useState<File[]>([])
  const [addFiles, setAddFiles] = useState<File[]>([])

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const response = await expenseEndpoints.list(listUserId, fromDate, toDate)
      setExpenses(response.data.data ?? [])
      setLatestRunningBalance(Number(response.data.summary?.latest_running_balance ?? 0))
    } catch (error) {
      console.error('Failed to load expenses', error)
      pushAlert('Unable to load expenses.', 'error')
      setLatestRunningBalance(0)
    } finally {
      setLoading(false)
    }
  }, [fromDate, pushAlert, toDate])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchExpenses()
  }, [fetchExpenses])

  useEffect(() => {
    const fetchFundAccounts = async () => {
      setFundOptionsLoading(true)
      try {
        const response = await fundDepositEndpoints.accounts()
        setFundAccountOptions(response.data ?? [])
      } catch (error) {
        console.error('Failed to load fund accounts', error)
        pushAlert('Unable to load fund accounts.', 'error')
        setFundAccountOptions([])
      } finally {
        setFundOptionsLoading(false)
      }
    }

    void fetchFundAccounts()
  }, [pushAlert])

  const openFilterModal = useCallback(() => {
    setFilterPreset(getPresetFromRange(fromDate, toDate))
    setFilterFromDate(fromDate)
    setFilterToDate(toDate)
    setFilterFundAmount(appliedFundAmount)
    setFilterCategoryType(appliedCategoryType)
    setFilterPaymentBy(appliedPaymentBy)
    setFilterModalOpen(true)
  }, [appliedCategoryType, appliedFundAmount, appliedPaymentBy, fromDate, toDate])

  const handleFilterPresetChange = useCallback((preset: DatePreset) => {
    setFilterPreset(preset)

    if (preset === 'custom') {
      return
    }

    const [nextFrom, nextTo] = getPresetRange(preset)
    setFilterFromDate(nextFrom)
    setFilterToDate(nextTo)
  }, [])

  const handleApplyFilters = () => {
    if (!filterFromDate || !filterToDate) {
      pushAlert('From date and to date are required.', 'error')
      return
    }

    if (filterFromDate > filterToDate) {
      pushAlert('Start date must be before end date.', 'error')
      return
    }

    setAppliedFundAmount(filterFundAmount)
    setAppliedCategoryType(filterCategoryType)
    setAppliedPaymentBy(filterPaymentBy)

    if (filterFromDate !== fromDate) {
      setFromDate(filterFromDate)
    }
    if (filterToDate !== toDate) {
      setToDate(filterToDate)
    }

    setFilterModalOpen(false)
  }

  const handleResetFilters = () => {
    const [defaultFrom, defaultTo] = getPresetRange('month')
    setFilterPreset('month')
    setFilterFromDate(defaultFrom)
    setFilterToDate(defaultTo)
    setFilterFundAmount('')
    setFilterCategoryType('')
    setFilterPaymentBy('')
    setAppliedFundAmount('')
    setAppliedCategoryType('')
    setAppliedPaymentBy('')
    setFromDate(defaultFrom)
    setToDate(defaultTo)
    setFilterModalOpen(false)
  }

  const openEditModal = (expense: ExpenseRecord) => {
    const userId = getCurrentUserId()
    setSelectedExpense(expense)
    setEditFiles([])
    setFormState({
      fund_account_id: String(expense.fund_account_id ?? ''),
      date_of_expense: expense.date_of_expense ?? getCurrentTimestamp(),
      purpose: String(expense.purpose ?? ''),
      withdrawn_amount: String(expense.withdrawn_amount ?? ''),
      returned_amount: String(expense.returned_amount ?? ''),
      running_balance: String(expense.running_balance ?? ''),
      category_tage: String(expense.category_tage ?? ''),
      payment_by: String(expense.payment_by ?? ''),
      created_by: String(expense.created_by ?? userId),
      updated_by: String(userId),
      updated_at: getCurrentTimestamp(),
      bill_url: String(expense.bill_url ?? ''),
    })
  }

  const openAddModal = useCallback(async () => {
    const userId = getCurrentUserId()
    setAddFiles([])
    const defaultFundAccountId = fundAccountOptions.length > 0 ? String(fundAccountOptions[0].id) : ''
    setAddFormState({
      ...getEmptyFormState(),
      fund_account_id: defaultFundAccountId,
      created_by: String(userId),
      updated_by: String(userId),
      date_of_expense: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
    })
    setAddModalOpen(true)
  }, [fundAccountOptions])

  const closeEditModal = () => {
    setSelectedExpense(null)
    setEditFiles([])
    setFormState(getEmptyFormState())
  }

  const closeAddModal = () => {
    const userId = getCurrentUserId()
    setAddModalOpen(false)
    setAddFiles([])
    setAddFormState({
      ...getEmptyFormState(),
      created_by: String(userId),
      updated_by: String(userId),
      date_of_expense: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp(),
    })
  }

  const handleSave = async () => {
    if (!selectedExpense) {
      pushAlert('Unable to determine which expense to update.', 'error')
      return
    }

    setSaving(true)

    try {
      const now = getCurrentTimestamp()
      const userId = getCurrentUserId()
      const immutableFundAccountId = Number(selectedExpense.fund_account_id ?? formState.fund_account_id ?? 0)
      const immutableWithdrawnAmount = Number(selectedExpense.withdrawn_amount ?? formState.withdrawn_amount ?? 0)
      const immutableReturnedAmount = Number(selectedExpense.returned_amount ?? formState.returned_amount ?? 0)
      await expenseEndpoints.update(
        {
          ...toPayload(formState),
          fund_account_id: immutableFundAccountId,
          withdrawn_amount: immutableWithdrawnAmount,
          returned_amount: immutableReturnedAmount,
          date_of_expense: now,
          created_by: userId,
          updated_by: userId,
          updated_at: now,
          running_balance: 0,
          bill_url: '',
        },
        selectedExpense.id,
        editFiles,
      )
      pushAlert('Expense saved successfully.', 'success')
      closeEditModal()
      setLoading(true)
      await fetchExpenses()
    } catch (error) {
      console.error('Failed to save expense', error)
      const apiErrorDetail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (typeof apiErrorDetail === 'string' && apiErrorDetail.trim().length > 0) {
        pushAlert(apiErrorDetail, 'error')
      } else {
        pushAlert('Unable to save expense.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAddExpense = async () => {
    if (!addFormState.fund_account_id || !addFormState.withdrawn_amount) {
      pushAlert('Fund account and withdrawn amount are required.', 'error')
      return
    }

    const withdrawnAmount = Number(addFormState.withdrawn_amount || 0)
    const returnedAmount = Number(addFormState.returned_amount || 0)

    if (returnedAmount > withdrawnAmount) {
      pushAlert('Returned amount cannot exceed withdrawn amount.', 'error')
      return
    }

    setSaving(true)

    try {
      const now = getCurrentTimestamp()
      const userId = getCurrentUserId()
      await expenseEndpoints.create(
        {
          ...toPayload(addFormState),
          date_of_expense: now,
          created_by: userId,
          updated_by: userId,
          updated_at: now,
          running_balance: 0,
          bill_url: '',
        },
        addFiles,
      )
      pushAlert('Expense created successfully.', 'success')
      closeAddModal()
      setLoading(true)
      await fetchExpenses()
    } catch (error) {
      console.error('Failed to create expense', error)
      const apiErrorDetail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (typeof apiErrorDetail === 'string' && apiErrorDetail.trim().length > 0) {
        pushAlert(apiErrorDetail, 'error')
      } else {
        pushAlert('Unable to create expense.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)

    try {
      await expenseEndpoints.remove(deleteTarget.id)
      pushAlert('Expense deleted successfully.', 'success')
      setDeleteTarget(null)
      setLoading(true)
      await fetchExpenses()
    } catch (error) {
      console.error('Failed to delete expense', error)
      pushAlert('Unable to delete expense.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const downloadReportZip = useCallback(async (reportBlob: Blob, reportFileName: string, records: ExpenseRecord[]) => {
    const zip = new JSZip()
    zip.file(reportFileName, reportBlob)

    const downloadedBills = await collectExpenseBillFiles(records)
    downloadedBills.forEach(({ blob, fileName, expenseId, index }) => {
      zip.file(`bills/expense-${expenseId}/${index + 1}-${fileName}`, blob)
    })

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipName = `expense-report-${slugifyReportRange(getDateRange(records))}.zip`
    triggerBlobDownload(zipBlob, zipName)
  }, [])

  const fundAmountOptions = useMemo(() => {
    return fundAccountOptions
      .slice()
      .sort((left, right) => left.fund_account.localeCompare(right.fund_account))
  }, [fundAccountOptions])

  const categoryTypeOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        expenses
          .map((expense) => String(expense.category_tage ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    return values.sort((left, right) => left.localeCompare(right))
  }, [expenses])

  const paymentByOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        expenses
          .map((expense) => String(expense.payment_by ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    return values.sort((left, right) => left.localeCompare(right))
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (appliedFundAmount && String(expense.fund_account_id ?? '') !== appliedFundAmount) {
        return false
      }

      if (appliedCategoryType) {
        const currentCategory = String(expense.category_tage ?? '').trim().toLowerCase()
        if (currentCategory !== appliedCategoryType.trim().toLowerCase()) {
          return false
        }
      }

      if (appliedPaymentBy) {
        const currentPaymentBy = String(expense.payment_by ?? '').trim().toLowerCase()
        if (currentPaymentBy !== appliedPaymentBy.trim().toLowerCase()) {
          return false
        }
      }

      return true
    })
  }, [appliedCategoryType, appliedFundAmount, appliedPaymentBy, expenses])

  const handleDownloadCSV = useCallback(async () => {
    setReportMenuOpen(false)
    const rows = buildReportRows(filteredExpenses)
    // Use selected filter dates for report header
    const dateRange = `${displayDate(fromDate)} to ${displayDate(toDate)}`
    const totalWithdrawnVal = filteredExpenses.reduce((sum, e) => sum + Number(e.withdrawn_amount || 0), 0)
    const totalRunningBalanceVal = getLatestRunningBalanceTotal(filteredExpenses)

    const colCount = TABLE_HEADERS.length
    // Column widths (characters): No, Fund Account, Date, Purpose, Withdrawn, Returned, Balance, Category, Payment
    const colWidths = [6, 20, 22, 30, 18, 18, 18, 20, 20]

    // Pad a value to a fixed width for monospace alignment
    const pad = (v: string | number, w: number) => String(v).substring(0, w).padEnd(w)

    // Centred text across all columns (for header rows exported as a single quoted cell repeated)
    const centre = (text: string) => {
      const totalWidth = colWidths.reduce((a, b) => a + b + 1, -1)
      const padLeft = Math.max(0, Math.floor((totalWidth - text.length) / 2))
      return ' '.repeat(padLeft) + text
    }

    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

    // Build empty cells to fill remaining columns after the first cell
    const emptyCols = Array(colCount - 1).fill('""').join(',')

    const lines: string[] = []
    lines.push(`${esc(centre('EXPENSE REPORT'))},${emptyCols}`)
    lines.push(`${esc(centre(`Date Range: ${dateRange}`))},${emptyCols}`)
    lines.push(`${esc(`Total Withdrawn: ${formatCurrency(totalWithdrawnVal)}`)},${emptyCols}`)
    lines.push(`${esc(`Running Balance: ${formatCurrency(totalRunningBalanceVal)}`)},${emptyCols}`)
    lines.push(Array(colCount).fill('""').join(','))
    lines.push(TABLE_HEADERS.map((h, i) => esc(pad(h, colWidths[i] ?? 16))).join(','))
    rows.forEach((row) => {
      lines.push(TABLE_KEYS.map((k, i) => esc(pad(row[k], colWidths[i] ?? 16))).join(','))
    })

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })

    try { 
      await downloadReportZip(blob, 'expense-report.csv', filteredExpenses)
    } catch (error) {
      console.error('Failed to download expense report ZIP', error)
      pushAlert('Unable to download expense report ZIP.', 'error')
    }
  }, [downloadReportZip, filteredExpenses, pushAlert, fromDate, toDate])

  const handleDownloadPDF = useCallback(async () => {
    setReportMenuOpen(false)
    const rows = buildReportRows(filteredExpenses)
    const pdfRows = rows.map((row) => ({
      ...row,
      withdrawn_amount: row.withdrawn_amount.replace('₹', 'Rs.'),
      returned_amount: row.returned_amount.replace('₹', 'Rs.'),
      running_balance: row.running_balance.replace('₹', 'Rs.'),
    }))
    // Use selected filter dates for report header
    const dateRange = `${displayDate(fromDate)} to ${displayDate(toDate)}`
    const totalWithdrawnVal = filteredExpenses.reduce((sum, e) => sum + Number(e.withdrawn_amount || 0), 0)
    const totalRunningBalanceVal = getLatestRunningBalanceTotal(filteredExpenses)

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    // Title — centred
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('EXPENSE REPORT', pageWidth / 2, 18, { align: 'center' })

    // Date range — centred
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date Range: ${dateRange}`, pageWidth / 2, 27, { align: 'center' })

    // jsPDF built-in helvetica doesn't support ₹; use Rs. for PDF only
    const pdfCurrency = (val: number) => formatCurrency(val).replace('₹', 'Rs.')

    // Summary rows — stacked on the left
    doc.setFont('helvetica', 'bold')
    doc.text(`Total Withdrawn: ${pdfCurrency(totalWithdrawnVal)}`, 14, 35)
    doc.text(`Running Balance: ${pdfCurrency(totalRunningBalanceVal)}`, 14, 42)

    // Table
    autoTable(doc, {
      startY: 50,
      head: [TABLE_HEADERS],
      body: pdfRows.map((row) => TABLE_KEYS.map((k) => row[k])),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      margin: { left: 14, right: 14 },
    })

    try {
      const blob = doc.output('blob')
      await downloadReportZip(blob, 'expense-report.pdf', filteredExpenses)
    } catch (error) {
      console.error('Failed to download expense report ZIP', error)
      pushAlert('Unable to download expense report ZIP.', 'error')
    }
  }, [downloadReportZip, filteredExpenses, pushAlert, fromDate, toDate])

  const handleDownloadBills = async (expense: ExpenseRecord) => {
    const bills = expense.bills ?? []

    if (bills.length === 0) {
      pushAlert('No bills available for this expense.', 'warning')
      return
    }

    setDownloadingExpenseId(expense.id)

    try {
      const zip = new JSZip()
      const downloadedFiles = await collectExpenseBillFiles([expense])

      if (downloadedFiles.length === 0) {
        throw new Error('No valid base64 bill data found in expense response.')
      }

      downloadedFiles.forEach(({ blob, fileName }) => {
        zip.file(fileName, blob)
      })

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      triggerBlobDownload(zipBlob, `expense-${expense.id}-bills.zip`)
    } catch (error) {
      console.error('Failed to download expense bills', error)
      pushAlert('Unable to download ZIP. No valid bill base64 data was returned by the API.', 'error')
    } finally {
      setDownloadingExpenseId(null)
    }
  }

  const totalWithdrawn = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + Number(expense.withdrawn_amount || 0), 0),
    [filteredExpenses],
  )
  const totalReturned = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + Number(expense.returned_amount || 0), 0),
    [filteredExpenses],
  )
  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <div>
          <button
            ref={reportBtnRef}
            type="button"
            className="btn-ghost"
            onClick={() => setReportMenuOpen((prev) => !prev)}
            disabled={filteredExpenses.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            EXPENSE REPORT
          </button>
          {isReportMenuOpen &&
            createPortal(
              <div
                ref={reportMenuRef}
                style={{ top: menuPosition.top, right: menuPosition.right }}
                className="glass-card fixed z-[9999] w-44 overflow-hidden p-1"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white/75"
                  onClick={handleDownloadCSV}
                >
                  <FileDown className="h-4 w-4" />
                  CSV
                </button>
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-white/70 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white/75"
                  onClick={handleDownloadPDF}
                >
                  <FileDown className="h-4 w-4" />
                  PDF
                </button>
              </div>,
              document.body,
            )}
        </div>
        <button type="button" className="btn-primary" onClick={openAddModal}>
          <Plus className="mr-2 h-4 w-4" />
          ADD EXPENSE
        </button>
        <button type="button" className="btn-primary" onClick={openFilterModal}>
          Filter
        </button>
      </div>,
    )

    return () => setActions(null)
  }, [
    filteredExpenses.length,
    handleDownloadCSV,
    handleDownloadPDF,
    isReportMenuOpen,
    menuPosition.right,
    menuPosition.top,
    openAddModal,
    openFilterModal,
    setActions,
  ])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <p>
          Showing data from <span className="font-bold text-slate-800">{displayDate(fromDate)}</span> to{' '}
          <span className="font-bold text-slate-800">{displayDate(toDate)}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Withdrawn" value={formatCurrency(totalWithdrawn)} note="Total debited" tone="warning" />
        <MetricCard label="Returned" value={formatCurrency(totalReturned)} note="Funds returned" tone="positive" />
        <MetricCard label="Running Balance" value={formatCurrency(latestRunningBalance)} note="Total balance" tone="neutral" />
      </div>

      <section>
        <SectionHeader
          title="Expense register"
          subtitle="Review operating spend streams, approvals, and unresolved exceptions in a structured queue."
        />

        {isLoading ? (
          <SectionLoader message="Loading expenses..." />
        ) : (
          <AppTable
            data={filteredExpenses}
            emptyMessage="No expenses available."
            columns={[
              {
                key: 'row_number',
                header: 'No.',
                render: (row) => {
                  const position = filteredExpenses.findIndex((expense) => expense.id === row.id)
                  return position >= 0 ? position + 1 : '-'
                },
              },
              {
                key: 'fund_account',
                header: 'Fund Account',
                render: (row) => {
                  if (!row.fund_account) return '-'
                  return (
                    <button
                      type="button"
                      className="table-link"
                      onClick={() =>
                        navigate(`/fund-ledger/${String(row.fund_account_id)}/${encodeURIComponent(row.fund_account!)}`, {
                          state: { source: 'expenses' },
                        })
                      }
                    >
                      {row.fund_account}
                    </button>
                  )
                },
              },
              { key: 'date_of_expense', header: 'Date of Expense', render: (row) => formatInUserTimezone(row.date_of_expense) },
              { key: 'purpose', header: 'Purpose', render: (row) => row.purpose },
              {
                key: 'withdrawn_amount',
                header: 'Withdrawn Amount',
                render: (row) => formatCurrency(Number(row.withdrawn_amount || 0)),
              },
              {
                key: 'returned_amount',
                header: 'Returned Amount',
                render: (row) => formatCurrency(Number(row.returned_amount || 0)),
              },
              {
                key: 'running_balance',
                header: 'Running Balance',
                render: (row) => formatCurrency(Number(row.running_balance || 0)),
              },
              { key: 'category_tage', header: 'Category Tag', render: (row) => row.category_tage },
              { key: 'payment_by', header: 'Payment By', render: (row) => row.payment_by },
              {
                key: 'bills',
                header: 'Bills',
                render: (row) => {
                  const billCount = row.bills?.length ?? 0
                  const isDisabled = downloadingExpenseId === row.id || billCount === 0

                  return (
                    <button
                      type="button"
                      className={`btn-ghost px-3 py-2 text-xs${isDisabled && downloadingExpenseId !== row.id ? ' cursor-not-allowed opacity-40' : ''}`}
                      onClick={() => handleDownloadBills(row)}
                      disabled={isDisabled}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {downloadingExpenseId === row.id
                        ? 'Downloading...'
                        : `Download Bill${billCount !== 1 ? 's' : ''} (${billCount})`}
                    </button>
                  )
                },
              },
              {
                key: 'actions',
                header: '',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost p-2"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => openEditModal(row)}
                    >
                      <PencilLine className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-2 text-rose-200 hover:bg-rose-500/15"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      <Modal title="Filter expenses" isOpen={isFilterModalOpen} onClose={() => setFilterModalOpen(false)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Date Filter</span>
            <select
              value={filterPreset}
              onChange={(event) => handleFilterPresetChange(event.target.value as DatePreset)}
              className="input-field"
            >
              {DATE_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {filterPreset === 'custom' ? (
            <>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>From Date</span>
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(event) => setFilterFromDate(event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>To Date</span>
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(event) => setFilterToDate(event.target.value)}
                  className="input-field"
                />
              </label>
            </>
          ) : null}
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Fund Amount</span>
            <select
              value={filterFundAmount}
              onChange={(event) => setFilterFundAmount(event.target.value)}
              className="input-field"
              disabled={isFundOptionsLoading}
            >
              <option value="">{isFundOptionsLoading ? 'Loading fund accounts...' : 'All fund accounts'}</option>
              {fundAmountOptions.map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.fund_account}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Category Type</span>
            <select
              value={filterCategoryType}
              onChange={(event) => setFilterCategoryType(event.target.value)}
              className="input-field"
            >
              <option value="">All categories</option>
              {categoryTypeOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Payment By</span>
            <select
              value={filterPaymentBy}
              onChange={(event) => setFilterPaymentBy(event.target.value)}
              className="input-field"
            >
              <option value="">All payment modes</option>
              {paymentByOptions.map((paymentBy) => (
                <option key={paymentBy} value={paymentBy}>
                  {paymentBy}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-modal-secondary" onClick={handleResetFilters}>
            Reset
          </button>
          <button type="button" className="btn-modal-secondary" onClick={() => setFilterModalOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-modal-primary" onClick={handleApplyFilters}>
            Apply
          </button>
        </div>
      </Modal>

      <Modal title="Edit expense" isOpen={selectedExpense !== null} onClose={closeEditModal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Fund Account *</span>
            <select
              value={formState.fund_account_id}
              className="input-field cursor-not-allowed opacity-60"
              disabled
              required
            >
              <option value="">{isFundOptionsLoading ? 'Loading fund accounts...' : 'Select fund account'}</option>
              {fundAccountOptions.map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.fund_account}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Payment By</span>
            <input
              value={formState.payment_by}
              onChange={(event) => setFormState((current) => ({ ...current, payment_by: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Category Tag</span>
            <input
              value={formState.category_tage}
              onChange={(event) => setFormState((current) => ({ ...current, category_tage: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Purpose</span>
            <input
              value={formState.purpose}
              onChange={(event) => setFormState((current) => ({ ...current, purpose: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Upload Bills</span>
            <input
              className="input-field"
              type="file"
              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
              multiple
              onChange={(event) => {
                const pickedFiles = Array.from(event.target.files ?? [])
                if (pickedFiles.length === 0) return
                setEditFiles((current) => [...current, ...pickedFiles])
              }}
            />
            {editFiles.length > 0 ? <p className="text-xs text-slate-300">{editFiles.length} file(s) selected</p> : null}
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-modal-secondary" onClick={closeEditModal}>
             Cancel
          </button>
            <button type="button" className="btn-modal-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      <Modal title="Add expense" isOpen={isAddModalOpen} onClose={closeAddModal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Fund Account *</span>
            <select
              value={addFormState.fund_account_id}
              onChange={(event) => setAddFormState((current) => ({ ...current, fund_account_id: event.target.value }))}
              className="input-field"
              disabled={isFundOptionsLoading}
              required
            >
              <option value="">{isFundOptionsLoading ? 'Loading fund accounts...' : 'Select fund account'}</option>
              {fundAccountOptions.map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.fund_account}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Payment By</span>
            <input
              value={addFormState.payment_by}
              onChange={(event) => setAddFormState((current) => ({ ...current, payment_by: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Withdrawn Amount *</span>
            <input
              value={addFormState.withdrawn_amount}
              onChange={(event) => setAddFormState((current) => ({ ...current, withdrawn_amount: event.target.value }))}
              className="input-field"
              type="number"
              min="0"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Returned Amount</span>
            <input
              value={addFormState.returned_amount}
              onChange={(event) => setAddFormState((current) => ({ ...current, returned_amount: event.target.value }))}
              className="input-field"
              type="number"
              min="0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Category Tag</span>
            <input
              value={addFormState.category_tage}
              onChange={(event) => setAddFormState((current) => ({ ...current, category_tage: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Purpose</span>
            <input
              value={addFormState.purpose}
              onChange={(event) => setAddFormState((current) => ({ ...current, purpose: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Upload Bills</span>
            <input
              className="input-field"
              type="file"
              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
              multiple
              onChange={(event) => {
                const pickedFiles = Array.from(event.target.files ?? [])
                if (pickedFiles.length === 0) return
                setAddFiles((current) => [...current, ...pickedFiles])
              }}
            />
            {addFiles.length > 0 ? <p className="text-xs text-slate-300">{addFiles.length} file(s) selected</p> : null}
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-modal-secondary" onClick={closeAddModal}>
             Cancel
          </button>
            <button type="button" className="btn-modal-primary" onClick={handleAddExpense} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add Expense'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        title="Delete expense"
        description="This will permanently delete the selected expense record."
        isOpen={deleteTarget !== null}
        isLoading={isDeleting}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </section>
  )
}
