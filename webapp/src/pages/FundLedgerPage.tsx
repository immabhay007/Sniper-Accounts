import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Filter, Plus } from 'lucide-react'
import JSZip from 'jszip'
import { AppTable } from '../components/AppTable'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { DepositFundModal } from '../components/DepositFundModal'
import { SectionHeader } from '../components/SectionHeader'
import { SectionLoader } from '../components/SectionLoader'
import { useAlerts } from '../components/alerts/useAlerts'
import { usePageHeaderActions } from '../layout/pageHeaderActionsContext'
import { api } from '../services/api'
import { fundDepositEndpoints, type FundLedgerRecord } from '../services/endpoints'
import { DATE_PRESET_OPTIONS, getPresetFromRange, getPresetRange, type DatePreset } from '../utils/dateFilters'
import { formatCurrency, getSystemTimezone } from '../utils/format'
import { tokenStorage } from '../utils/storage'
import { formatInUserTimezone } from '../utils/timezone'

type LedgerSource = 'dashboard' | 'fund' | 'expenses'

type LedgerLocationState = {
  source?: LedgerSource
}

type FundAccountDetails = {
  id: number
  name: string
}

type DepositFundFormState = {
  deposited_fund: string
  mode_of_transfer: string
}

type FundLedgerBillRecord = FundLedgerRecord

const emptyDepositFundFormState: DepositFundFormState = {
  deposited_fund: '',
  mode_of_transfer: '',
}

const getCurrentTimestamp = (): string => new Date().toISOString()

const displayDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

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
  if (looksLikeUrl) return null

  const normalized = trimmed.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized) || normalized.length < 32) return null

  return {
    mimeType: normalized.startsWith('JVBER') ? 'application/pdf' : 'application/octet-stream',
    base64: normalized,
  }
}

const sanitizeFileName = (value: string, fallbackName: string): string => {
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

const getBillFileNameFromSource = (source: string, fallbackName: string): string => {
  const trimmed = source.trim()

  try {
    if (trimmed.startsWith('data:')) {
      const match = trimmed.match(/^data:([^;]+);base64,.+$/)
      const mimeType = match?.[1] ?? 'application/octet-stream'
      const extension = mimeType === 'application/pdf'
        ? 'pdf'
        : mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/jpeg' || mimeType === 'image/jpg'
            ? 'jpg'
            : mimeType === 'image/webp'
              ? 'webp'
              : 'bin'
      return sanitizeFileName(`${fallbackName}.${extension}`, `${fallbackName}.${extension}`)
    }

    const pathname = new URL(trimmed).pathname
    const fileName = pathname.split('/').filter(Boolean).pop()
    if (fileName) {
      return sanitizeFileName(decodeURIComponent(fileName), fallbackName)
    }
  } catch {
    // Fall back to generated names below.
  }

  const base64Bill = parseBase64Bill(trimmed)
  const extension = base64Bill?.mimeType === 'application/pdf'
    ? 'pdf'
    : base64Bill?.mimeType === 'image/png'
      ? 'png'
      : base64Bill?.mimeType === 'image/jpeg' || base64Bill?.mimeType === 'image/jpg'
        ? 'jpg'
        : base64Bill?.mimeType === 'image/webp'
          ? 'webp'
          : 'bin'

  return sanitizeFileName(`${fallbackName}.${extension}`, `${fallbackName}.${extension}`)
}

const getLedgerBillFiles = (row: FundLedgerBillRecord): string[] =>
  Array.from(
    new Set([
      ...(Array.isArray(row.bill_files) ? row.bill_files : []),
      ...(typeof row.bill_file === 'string' && row.bill_file.trim() ? [row.bill_file] : []),
    ].filter((file): file is string => typeof file === 'string' && file.trim().length > 0)),
  )

const base64ToBlob = (base64Value: string, mimeType: string): Blob => {
  const binary = window.atob(base64Value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

const fetchFileBlob = async (source: string): Promise<Blob> => {
  const trimmed = source.trim()
  const base64Bill = parseBase64Bill(trimmed)
  if (base64Bill) {
    return base64ToBlob(base64Bill.base64, base64Bill.mimeType)
  }

  if (trimmed.startsWith('data:')) {
    throw new Error('Bill payload did not contain valid base64 data.')
  }

  try {
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

const collectBillFiles = async (sources: string[], fallbackBaseName: string) => {
  const results = await Promise.allSettled(
    sources.map(async (source, index) => {
      const blob = await fetchFileBlob(source)
      const fileName = getBillFileNameFromSource(source, `${fallbackBaseName}-${String(index + 1).padStart(2, '0')}`)
      return { blob, fileName }
    }),
  )

  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
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

export const FundLedgerPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { pushAlert } = useAlerts()
  const { setActions, setTitle } = usePageHeaderActions()
  const { fundAccountId, fundAccountName } = useParams<{
    fundAccountId?: string
    fundAccountName?: string
  }>()
  const source = (location.state as LedgerLocationState | null)?.source

  const [ledgerData, setLedgerData] = useState<FundLedgerRecord[]>([])
  const [isLoading, setLoading] = useState(true)
  // Removed unused hasLoadedLedger
  const [isSaving, setSaving] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [fundAccount, setFundAccount] = useState<FundAccountDetails | null>(null)
  const [fromDate, setFromDate] = useState<string>(() => getPresetRange('year')[0])
  const [toDate, setToDate] = useState<string>(() => getPresetRange('year')[1])
  const [isFilterModalOpen, setFilterModalOpen] = useState(false)
  const [filterPreset, setFilterPreset] = useState<DatePreset>('year')
  const [filterFromDate, setFilterFromDate] = useState<string>(fromDate)
  const [filterToDate, setFilterToDate] = useState<string>(toDate)
  const [isDepositModalOpen, setDepositModalOpen] = useState(false)
  const [depositFormState, setDepositFormState] = useState<DepositFundFormState>(emptyDepositFundFormState)
  const [downloadingBillId, setDownloadingBillId] = useState<number | null>(null)
  const [depositFiles, setDepositFiles] = useState<File[]>([])
  const decodedFundAccountName = fundAccount?.name ?? (fundAccountName ? decodeURIComponent(fundAccountName) : '')

  const resolveFundAccountDetails = useCallback(async (): Promise<FundAccountDetails | null> => {
    const rawFundAccountId = fundAccountId?.trim() ?? ''
    const decodedRouteFundAccountName = fundAccountName ? decodeURIComponent(fundAccountName) : ''
    const parsedFundAccountId = Number(rawFundAccountId)

    if (Number.isFinite(parsedFundAccountId) && parsedFundAccountId > 0) {
      if (decodedRouteFundAccountName) {
        return { id: parsedFundAccountId, name: decodedRouteFundAccountName }
      }

      try {
        const response = await fundDepositEndpoints.accounts()
        const account = response.data?.find((item) => item.id === parsedFundAccountId)
        if (account) {
          return { id: account.id, name: account.fund_account }
        }
      } catch (error) {
        console.error('Failed to resolve fund account name', error)
      }

      return { id: parsedFundAccountId, name: 'Fund' }
    }

    const lookupName = decodedRouteFundAccountName || (rawFundAccountId ? decodeURIComponent(rawFundAccountId) : '')
    if (!lookupName) {
      pushAlert('Fund account information is missing.', 'error')
      return null
    }

    try {
      const response = await fundDepositEndpoints.accounts()
      const account = response.data?.find((item) => item.fund_account === lookupName)
      if (account) {
        return { id: account.id, name: account.fund_account }
      }
    } catch (error) {
      console.error('Failed to resolve fund account ID', error)
    }

    pushAlert('Fund account not found.', 'error')
    return null
  }, [fundAccountId, fundAccountName, pushAlert])

  const loadLedgerData = useCallback(async () => {
    setLoading(true)
    setHasError(false)

    try {
      const account = await resolveFundAccountDetails()
      if (!account) {
        setLedgerData([])
        setFundAccount(null)
        return
      }

      setFundAccount(account)
      const response = await fundDepositEndpoints.history(account.id, fromDate, toDate)
      setLedgerData(response.data ?? [])
    } catch (error) {
      console.error('Failed to load fund ledger', error)
      pushAlert('Unable to load fund ledger.', 'error')
      setLedgerData([])
      setHasError(true)
    } finally {
      setLoading(false)
    }
  }, [fromDate, pushAlert, resolveFundAccountDetails, toDate])

  useEffect(() => {
    void loadLedgerData()
  }, [loadLedgerData])

  const currentUserId = tokenStorage.getAuthUser()?.user?.id ?? 0

  const openFilterModal = useCallback(() => {
    setFilterPreset(getPresetFromRange(fromDate, toDate))
    setFilterFromDate(fromDate)
    setFilterToDate(toDate)
    setFilterModalOpen(true)
  }, [fromDate, toDate])

  const handleFilterPresetChange = useCallback((preset: DatePreset) => {
    setFilterPreset(preset)

    if (preset === 'custom') {
      return
    }

    const [nextFrom, nextTo] = getPresetRange(preset)
    setFilterFromDate(nextFrom)
    setFilterToDate(nextTo)
  }, [])

  const openDepositModal = useCallback(() => {
    if (!fundAccount) {
      pushAlert('Fund account is not ready yet.', 'error')
      return
    }

    setDepositFormState(emptyDepositFundFormState)
    setDepositModalOpen(true)
  }, [fundAccount, pushAlert])

  const closeDepositModal = () => {
    setDepositModalOpen(false)
    setDepositFormState(emptyDepositFundFormState)
  }

  const handleDepositFund = async () => {
    if (!fundAccount) {
      pushAlert('Unable to determine the current fund account.', 'error')
      return
    }

    if (!depositFormState.deposited_fund.trim()) {
      pushAlert('Fund is required.', 'error')
      return
    }

    if (!currentUserId) {
      pushAlert('Unable to determine current user.', 'error')
      return
    }

    setSaving(true)

    try {
      await fundDepositEndpoints.addAmount(
        {
          deposited_fund: Number(depositFormState.deposited_fund || 0),
          date_of_deposit: getCurrentTimestamp(),
          mode_of_transfer: depositFormState.mode_of_transfer.trim(),
          added_by: currentUserId,
          timezone: getSystemTimezone(),
        },
        fundAccount.id,
        depositFiles
      )

      pushAlert('Fund amount deposited successfully.', 'success')
      closeDepositModal()
      setDepositFiles([])
      await loadLedgerData()
    } catch (error) {
      console.error('Failed to deposit fund amount', error)
      pushAlert('Unable to deposit fund amount.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadBillFile = async (row: FundLedgerBillRecord) => {
    const billFiles = getLedgerBillFiles(row)

    if (billFiles.length === 0) {
      pushAlert('No bill file available for this record.', 'error')
      return
    }

    setDownloadingBillId(row.id)
    try {
      let fundAccountName = ''
      if (typeof fundAccount?.name === 'string' && fundAccount.name.trim()) {
        fundAccountName = fundAccount.name.trim().replace(/[^a-zA-Z0-9]+/g, '_')
      } else {
        fundAccountName = 'fund'
      }

      // Find the index from the bottom
      let seq = 1
      if (Array.isArray(ledgerData) && ledgerData.length > 0) {
        const idx = ledgerData.findIndex((record) => record.id === row.id)
        if (idx !== -1) {
          seq = ledgerData.length - idx
        }
      }
      const seqStr = seq.toString().padStart(2, '0')

      if (billFiles.length === 1) {
        const [singleBillFile] = billFiles
        const blob = await fetchFileBlob(singleBillFile)
        const fileName = getBillFileNameFromSource(singleBillFile, `${fundAccountName}_amount_deposited_bill_${seqStr}`)
        triggerBlobDownload(blob, fileName)
        return
      }

      const zip = new JSZip()
      const downloadedFiles = await collectBillFiles(billFiles, `${fundAccountName}_amount_deposited_bill_${seqStr}`)

      if (downloadedFiles.length === 0) {
        throw new Error('No valid bill files were returned by the API.')
      }

      downloadedFiles.forEach(({ blob, fileName }) => {
        zip.file(fileName, blob)
      })

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      triggerBlobDownload(zipBlob, `${fundAccountName}_amount_deposited_bill_${seqStr}.zip`)
    } catch (error) {
      console.error('Failed to download fund ledger bill file', error)
      pushAlert('Unable to download bill file.', 'error')
    } finally {
      setDownloadingBillId(null)
    }
  }

  const handleBack = useCallback(() => {
    switch (source) {
      case 'dashboard':
        navigate('/')
        return
      case 'fund':
        navigate('/fund')
        return
      case 'expenses':
        navigate('/expenses')
        return
      default:
        navigate(-1)
    }
  }, [navigate, source])

  const handleApplyFilters = () => {
    if (!filterFromDate || !filterToDate) {
      pushAlert('From date and to date are required.', 'error')
      return
    }

    if (filterFromDate > filterToDate) {
      pushAlert('Start date must be before end date.', 'error')
      return
    }

    if (filterFromDate !== fromDate) {
      setFromDate(filterFromDate)
    }
    if (filterToDate !== toDate) {
      setToDate(filterToDate)
    }

    setFilterModalOpen(false)
  }

  const handleResetFilters = () => {
    const [defaultFrom, defaultTo] = getPresetRange('year')
    setFilterPreset('year')
    setFilterFromDate(defaultFrom)
    setFilterToDate(defaultTo)
    setFromDate(defaultFrom)
    setToDate(defaultTo)
    setFilterModalOpen(false)
  }

  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost" onClick={handleBack} title="Back" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button type="button" className="btn-primary" onClick={openDepositModal}>
          <Plus className="mr-2 h-4 w-4" />
          Deposit Fund
        </button>
        <button type="button" className="btn-primary" onClick={openFilterModal}>
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </button>
      </div>,
    )

    return () => setActions(null)
  }, [handleBack, openDepositModal, openFilterModal, setActions])

  const totalCredit = ledgerData.reduce((sum, record) => sum + Number(record.credit || 0), 0)
  const totalDebit = ledgerData.reduce((sum, record) => sum + Number(record.debit || 0), 0)
  const latestRecord = ledgerData.length > 0
    ? [...ledgerData].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())[0]
    : null
  const finalBalance = latestRecord ? latestRecord.running_balance : 0
  const ledgerTitle = `${decodedFundAccountName || 'Fund'} Fund Ledger`

  useEffect(() => {
    setTitle(ledgerTitle)

    return () => setTitle(null)
  }, [ledgerTitle, setTitle])

  return (
    <section className="space-y-5">

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <p>
          Showing data from <span className="font-bold text-slate-800">{displayDate(fromDate)}</span> to{' '}
          <span className="font-bold text-slate-800">{displayDate(toDate)}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Credit" value={formatCurrency(totalCredit)} note="Total inflow" tone="positive" />
        <MetricCard label="Total Debit" value={formatCurrency(totalDebit)} note="Total outflow" tone="warning" />
        <MetricCard
          label="Running Balance"
          value={formatCurrency(finalBalance)}
          note={(finalBalance ?? 0) >= 0 ? 'Healthy balance' : 'Negative balance'}
          tone={(finalBalance ?? 0) >= 0 ? 'positive' : 'danger'}
        />
      </div>

      <section>
        <SectionHeader title={ledgerTitle} subtitle="Transaction history" />

        {isLoading ? (
          <SectionLoader message="Loading fund ledger..." />
        ) : (
          <AppTable
            data={ledgerData}
            emptyMessage={hasError ? 'Unable to load fund ledger.' : 'No transactions available.'}
            columns={[
              {
                key: 'transaction_date',
                header: 'Transaction Date',
                  render: (row) => formatInUserTimezone(row.transaction_date),
              },
              {
                key: 'opening_balance',
                header: 'Opening Balance',
                render: (row) => formatCurrency(Number(row.opening_balance || 0)),
              },
              {
                key: 'credit',
                header: 'Credit',
                render: (row) => formatCurrency(Number(row.credit || 0)),
              },
              {
                key: 'debit',
                header: 'Debit',
                render: (row) => formatCurrency(Number(row.debit || 0)),
              },
              {
                key: 'running_balance',
                header: 'Running Balance',
                render: (row) => formatCurrency(Number(row.running_balance || 0)),
              },
              { key: 'reference', header: 'Reference', render: (row) => row.reference || '-' },
              {
                key: 'bill_files',
                header: 'Bill File',
                render: (row) => {
                  const billCount = getLedgerBillFiles(row).length
                  const isDisabled = downloadingBillId === row.id || billCount === 0

                  return (
                    <button
                      type="button"
                      className={`btn-ghost px-3 py-2 text-xs${isDisabled && downloadingBillId !== row.id ? ' cursor-not-allowed opacity-40' : ''}`}
                      onClick={() => void handleDownloadBillFile(row)}
                      disabled={isDisabled}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {downloadingBillId === row.id
                        ? 'Downloading...'
                        : `Download File${billCount !== 1 ? 's' : ''} (${billCount})`}
                    </button>
                  )
                },
              },
              { key: 'added_by', header: 'Added By', render: (row) => row.added_by || '-' },
            ]}
          />
        )}
      </section>


      <DepositFundModal
        isOpen={isDepositModalOpen}
        onClose={() => {
          closeDepositModal();
          setDepositFiles([]);
        }}
        onSave={handleDepositFund}
        isSaving={isSaving}
        depositedFund={depositFormState.deposited_fund}
        modeOfTransfer={depositFormState.mode_of_transfer}
        onChangeDepositedFund={val => setDepositFormState(current => ({ ...current, deposited_fund: val }))}
        onChangeModeOfTransfer={val => setDepositFormState(current => ({ ...current, mode_of_transfer: val }))}
        showFileUpload={true}
        files={depositFiles}
        onFilesChange={setDepositFiles}
      />

      <Modal title="Filter transactions" isOpen={isFilterModalOpen} onClose={() => setFilterModalOpen(false)}>
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
    </section>
  )
}
