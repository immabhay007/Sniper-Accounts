import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, PencilLine, Plus, Trash2 } from 'lucide-react'
import { AppTable } from '../components/AppTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Modal } from '../components/Modal'
import { DepositFundModal } from '../components/DepositFundModal'
import { MetricCard } from '../components/MetricCard'
import { SectionHeader } from '../components/SectionHeader'
import { SectionLoader } from '../components/SectionLoader'
import { useAlerts } from '../components/alerts/useAlerts'
import { usePageHeaderActions } from '../layout/pageHeaderActionsContext'
import {
  fundDepositEndpoints,
  type FundDepositAccountOption,
  type FundDepositAddAmountPayload,
  type FundDepositPayload,
  type FundDepositRecord,
  type FundDepositSummary,
  type FundDepositListResponse,
} from '../services/endpoints'
import { DATE_PRESET_OPTIONS, getPresetFromRange, getPresetRange, type DatePreset } from '../utils/dateFilters'
import { formatCurrency, getSystemTimezone } from '../utils/format'
import { formatInUserTimezone } from '../utils/timezone'
import { tokenStorage } from '../utils/storage'

const listUserId = 0
const authUserKey = 'sniper-accountant-user'

const getCurrentUserId = (): number => {
  try {
    const authUser = tokenStorage.getAuthUser()
    return authUser?.user?.id ?? 0
  } catch {
    return 0
  }
}

type FundDepositFormState = {
  fund_account: string
  budgeted_fund: string
  deposited_fund: string
  opening_balance: string
  date_of_deposit: string
  mode_of_transfer: string
  remarks: string
}

type FundAmountDepositFormState = {
  deposited_fund: string
  mode_of_transfer: string
}

const getFileLabel = (files: File[]): string => {
  if (files.length === 0) return ''
  return `${files.length} file${files.length === 1 ? '' : 's'} selected`
}

const getCurrentTimestamp = (): string => new Date().toISOString()

const displayDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

const emptyFormState: FundDepositFormState = {
  fund_account: '',
  budgeted_fund: '',
  deposited_fund: '',
  opening_balance: '',
  date_of_deposit: getCurrentTimestamp(),
  mode_of_transfer: '',
  remarks: '',
}

const emptyFundAmountDepositFormState: FundAmountDepositFormState = {
  deposited_fund: '',
  mode_of_transfer: '',
}

const toLocalDateInputValue = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

const toPayload = (formState: FundDepositFormState): Omit<FundDepositPayload, 'added_by'> => {
  return {
    fund_account: formState.fund_account.trim(),
    budgeted_fund: Number(formState.budgeted_fund || 0),
    deposited_fund: Number(formState.deposited_fund || 0),
    opening_balance: Number(formState.opening_balance || 0),
    date_of_deposit: new Date(formState.date_of_deposit).toISOString(),
    mode_of_transfer: formState.mode_of_transfer.trim(),
    remarks: formState.remarks.trim(),
    timezone: getSystemTimezone(),
  }
}

const toAddAmountPayload = (
  formState: FundAmountDepositFormState,
  addedBy: number,
): FundDepositAddAmountPayload => {
  return {
    deposited_fund: Number(formState.deposited_fund || 0),
    date_of_deposit: getCurrentTimestamp(),
    mode_of_transfer: formState.mode_of_transfer.trim(),
    added_by: addedBy,
    timezone: getSystemTimezone(),
  }
}

const getAddedByFromLocalStorage = (): number => {
  const rawValue = localStorage.getItem(authUserKey)
  if (!rawValue) {
    return 0
  }

  try {
    const parsed = JSON.parse(rawValue) as { user?: { id?: number } }
    const userId = Number(parsed?.user?.id ?? 0)
    return Number.isFinite(userId) ? userId : 0
  } catch {
    return 0
  }
}

export const FundPage = () => {
  const navigate = useNavigate()
  const { pushAlert } = useAlerts()
  const { setActions: setPageHeaderActions } = usePageHeaderActions()
  const [deposits, setDeposits] = useState<FundDepositRecord[]>([])
  const [summary, setSummary] = useState<FundDepositSummary | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState<string>(() => getPresetRange('month')[0])
  const [toDate, setToDate] = useState<string>(() => getPresetRange('month')[1])
  const [isFilterModalOpen, setFilterModalOpen] = useState(false)
  const [appliedFundAmount, setAppliedFundAmount] = useState<string>('')
  const [appliedModeOfTransfer, setAppliedModeOfTransfer] = useState<string>('')
  const [filterFromDate, setFilterFromDate] = useState<string>(fromDate)
  const [filterToDate, setFilterToDate] = useState<string>(toDate)
  const [filterPreset, setFilterPreset] = useState<DatePreset>('month')
  const [filterFundAmount, setFilterFundAmount] = useState<string>('')
  const [filterModeOfTransfer, setFilterModeOfTransfer] = useState<string>('')
  const [fundAccountOptions, setFundAccountOptions] = useState<FundDepositAccountOption[]>([])
  const [isFundAccountOptionsLoading, setFundAccountOptionsLoading] = useState(false)
  const [isSaving, setSaving] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const [isAddModalOpen, setAddModalOpen] = useState(false)
  const [selectedDeposit, setSelectedDeposit] = useState<FundDepositRecord | null>(null)
  const [depositTarget, setDepositTarget] = useState<FundDepositRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FundDepositRecord | null>(null)
  const [formState, setFormState] = useState<FundDepositFormState>(emptyFormState)
  const [addFormState, setAddFormState] = useState<FundDepositFormState>(emptyFormState)
  const [amountDepositFormState, setAmountDepositFormState] = useState<FundAmountDepositFormState>(
    emptyFundAmountDepositFormState,
  )
  const [addFiles, setAddFiles] = useState<File[]>([])
  const [editFiles, setEditFiles] = useState<File[]>([])
  const [depositFiles, setDepositFiles] = useState<File[]>([])

  const fetchDeposits = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fundDepositEndpoints.list(listUserId, fromDate, toDate)
      const resp: FundDepositListResponse = response.data
      setDeposits(resp?.data ?? [])
      setSummary(resp?.summary ?? null)
    } catch (error) {
      console.error('Failed to load fund deposits', error)
      pushAlert('Unable to load fund deposits.', 'error')
    } finally {
      setLoading(false)
    }
  }, [fromDate, pushAlert, toDate])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDeposits()
  }, [fetchDeposits])

  useEffect(() => {
    const fetchFundAccounts = async () => {
      setFundAccountOptionsLoading(true)
      try {
        const response = await fundDepositEndpoints.accounts()
        setFundAccountOptions(response.data ?? [])
      } catch (error) {
        console.error('Failed to load fund accounts', error)
        pushAlert('Unable to load fund accounts.', 'error')
        setFundAccountOptions([])
      } finally {
        setFundAccountOptionsLoading(false)
      }
    }

    void fetchFundAccounts()
  }, [pushAlert])

  const openFilterModal = useCallback(() => {
    setFilterPreset(getPresetFromRange(fromDate, toDate))
    setFilterFromDate(fromDate)
    setFilterToDate(toDate)
    setFilterFundAmount(appliedFundAmount)
    setFilterModeOfTransfer(appliedModeOfTransfer)
    setFilterModalOpen(true)
  }, [appliedFundAmount, appliedModeOfTransfer, fromDate, toDate])

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
    setAppliedModeOfTransfer(filterModeOfTransfer)

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
    setFilterModeOfTransfer('')
    setAppliedFundAmount('')
    setAppliedModeOfTransfer('')
    setFromDate(defaultFrom)
    setToDate(defaultTo)
    setFilterModalOpen(false)
  }

  const openEditModal = (deposit: FundDepositRecord) => {
    setSelectedDeposit(deposit)
    setFormState({
      fund_account: deposit.fund_account,
      budgeted_fund: String(deposit.budgeted_fund),
      deposited_fund: String(deposit.deposited_fund || 0),
      opening_balance: String(deposit.opening_balance || 0),
      date_of_deposit: toLocalDateInputValue(deposit.date_of_deposit),
      mode_of_transfer: deposit.mode_of_transfer,
      remarks: deposit.remarks,
    })
    setEditFiles([])
  }

  const openAddModal = useCallback(() => {
    setAddFormState({
      ...emptyFormState,
      date_of_deposit: getCurrentTimestamp(),
    })
    setAddFiles([])
    setAddModalOpen(true)
  }, [])

  const openDepositModal = (deposit: FundDepositRecord) => {
    setDepositTarget(deposit)
    setAmountDepositFormState({
      ...emptyFundAmountDepositFormState,
      mode_of_transfer: deposit.mode_of_transfer ?? '',
    })
    setDepositFiles([])
  }

  const closeEditModal = () => {
    setSelectedDeposit(null)
    setFormState(emptyFormState)
    setEditFiles([])
  }

  const closeAddModal = () => {
    setAddModalOpen(false)
    setAddFormState({
      ...emptyFormState,
      date_of_deposit: getCurrentTimestamp(),
    })
    setAddFiles([])
  }

  const closeDepositModal = () => {
    setDepositTarget(null)
    setAmountDepositFormState(emptyFundAmountDepositFormState)
    setDepositFiles([])
  }

  const handleSave = async () => {
    if (!formState.fund_account) {
      pushAlert('Fund account is required.', 'error')
      return
    }

    if (!selectedDeposit) {
      pushAlert('Unable to determine which fund deposit to update.', 'error')
      return
    }

    setSaving(true)

    try {
      await fundDepositEndpoints.update(
        {
          ...toPayload(formState),
          date_of_deposit: getCurrentTimestamp(),
          added_by: selectedDeposit.added_by,
        },
        selectedDeposit.id,
        editFiles,
      )
      pushAlert('Fund deposit saved successfully.', 'success')
      closeEditModal()
      setLoading(true)
      await fetchDeposits()
    } catch (error) {
      console.error('Failed to save fund deposit', error)
      pushAlert('Unable to save fund deposit.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddFund = async () => {
    if (!addFormState.fund_account || !addFormState.opening_balance) {
      pushAlert('Fund account and opening balance are required.', 'error')
      return
    }

    setSaving(true)

    try {
      const userId = getCurrentUserId()
      await fundDepositEndpoints.create({
        ...toPayload(addFormState),
        date_of_deposit: getCurrentTimestamp(),
        added_by: userId,
      }, addFiles)
      pushAlert('Fund deposit created successfully.', 'success')
      closeAddModal()
      setLoading(true)
      await fetchDeposits()
    } catch (error) {
      console.error('Failed to create fund deposit', error)
      pushAlert('Unable to create fund deposit.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDepositAmount = async () => {
    if (!depositTarget) {
      pushAlert('Unable to determine which fund deposit to update.', 'error')
      return
    }

    if (!amountDepositFormState.deposited_fund.trim()) {
      pushAlert('Fund is required.', 'error')
      return
    }

    const addedBy = getAddedByFromLocalStorage()
    if (!addedBy) {
      pushAlert('Unable to determine current user.', 'error')
      return
    }

    setSaving(true)

    try {
      await fundDepositEndpoints.addAmount(toAddAmountPayload(amountDepositFormState, addedBy), depositTarget.id, depositFiles)
      pushAlert('Fund amount deposited successfully.', 'success')
      closeDepositModal()
      setLoading(true)
      await fetchDeposits()
    } catch (error) {
      console.error('Failed to deposit fund amount', error)
      pushAlert('Unable to deposit fund amount.', 'error')
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
      await fundDepositEndpoints.remove(deleteTarget.id)
      pushAlert('Fund deposit deleted successfully.', 'success')
      setDeleteTarget(null)
      setLoading(true)
      await fetchDeposits()
    } catch (error) {
      console.error('Failed to delete fund deposit', error)
      pushAlert('Unable to delete fund deposit.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const fundAccountById = useMemo(() => {
    return new Map(fundAccountOptions.map((option) => [String(option.id), option.fund_account.trim().toLowerCase()]))
  }, [fundAccountOptions])

  const modeOfTransferOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        deposits
          .map((deposit) => String(deposit.mode_of_transfer ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    )
    return values.sort((left, right) => left.localeCompare(right))
  }, [deposits])

  const filteredDeposits = useMemo(() => {
    return deposits.filter((deposit) => {
      if (appliedFundAmount) {
        const selectedName = fundAccountById.get(appliedFundAmount)
        const currentName = String(deposit.fund_account ?? '').trim().toLowerCase()
        if (!selectedName || currentName !== selectedName) {
          return false
        }
      }

      if (appliedModeOfTransfer) {
        const currentMode = String(deposit.mode_of_transfer ?? '').trim().toLowerCase()
        if (currentMode !== appliedModeOfTransfer.trim().toLowerCase()) {
          return false
        }
      }

      return true
    })
  }, [appliedFundAmount, appliedModeOfTransfer, deposits, fundAccountById])

  useEffect(() => {
    setPageHeaderActions(
      <>
        <button type="button" className="btn-primary" onClick={openAddModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Fund
        </button>
        <button type="button" className="btn-primary" onClick={openFilterModal}>
          Filter
        </button>
      </>,
    )

    return () => {
      setPageHeaderActions(null)
    }
  }, [openAddModal, openFilterModal, setPageHeaderActions])


  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <p>
          Showing data from <span className="font-bold text-slate-800">{displayDate(fromDate)}</span> to{' '}
          <span className="font-bold text-slate-800">{displayDate(toDate)}</span>
        </p>
      </div>

      <section className="mb-8">
        <SectionHeader title="Fund Summary" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <MetricCard
            label="Deposited"
            value={formatCurrency(summary?.total_deposited ?? 0)}
            note="Total deposited"
            tone="positive"
          />
          <MetricCard
            label="Withdrawn"
            value={formatCurrency(summary?.total_spent ?? 0)}
            note="Total withdrawn"
            tone="warning"
          />
          <MetricCard
            label="Running Balance"
            value={formatCurrency(summary?.net_balance ?? 0)}
            note={(summary?.net_balance ?? 0) >= 0 ? 'Available balance' : 'Negative balance'}
            tone={(summary?.net_balance ?? 0) >= 0 ? 'positive' : 'danger'}
          />
        </div>
      </section>

      <section>
        <SectionHeader
          title="Fund deposit register"
        />

        {isLoading ? (
          <SectionLoader message="Loading fund deposits..." />
        ) : (
          <AppTable
            data={filteredDeposits}
            emptyMessage="No fund deposits available."
            columns={[
              {
                key: 'fund_account',
                header: 'Fund Account',
                render: (row) => (
                  <button
                    type="button"
                    className="table-link"
                    onClick={() =>
                      navigate(`/fund-ledger/${row.id}/${encodeURIComponent(row.fund_account)}`, {
                        state: { source: 'fund' },
                      })
                    }
                  >
                    {row.fund_account}
                  </button>
                ),
              },
              {
                key: 'budgeted_fund',
                header: 'Budgeted Fund',
                render: (row) => formatCurrency(Number(row.budgeted_fund || 0)),
              },
              {
                key: 'deposited_fund',
                header: 'Deposited Fund',
                render: (row) => formatCurrency(Number(row.deposited_fund || 0)),
              },
              {
                key: 'total_spent',
                header: 'Spent',
                render: (row) => formatCurrency(Number(row.total_spent || 0)),
              },
              {
                key: 'running_balance',
                header: 'Running Balance',
                render: (row) => formatCurrency(Number(row.running_balance || 0)),
              },
              { key: 'date_of_deposit', header: 'Date of Deposit', render: (row) => formatInUserTimezone(row.date_of_deposit) },
              { key: 'mode_of_transfer', header: 'Mode of Transfer', render: (row) => row.mode_of_transfer },
              { key: 'remarks', header: 'Remarks', render: (row) => row.remarks || '-' },
              {
                key: 'actions',
                header: 'Action',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost p-2"
                      title="Deposit"
                      aria-label="Deposit"
                      onClick={() => openDepositModal(row)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-2"
                      title="View Ledger"
                      aria-label="View Ledger"
                      onClick={() =>
                        navigate(`/fund-ledger/${row.id}/${encodeURIComponent(row.fund_account)}`, {
                          state: { source: 'fund' },
                        })
                      }
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
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

      <Modal title="Filter funds" isOpen={isFilterModalOpen} onClose={() => setFilterModalOpen(false)}>
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
              disabled={isFundAccountOptionsLoading}
            >
              <option value="">{isFundAccountOptionsLoading ? 'Loading fund accounts...' : 'All fund accounts'}</option>
              {fundAccountOptions.map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.fund_account}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Mode of Transfer</span>
            <select
              value={filterModeOfTransfer}
              onChange={(event) => setFilterModeOfTransfer(event.target.value)}
              className="input-field"
            >
              <option value="">All transfer modes</option>
              {modeOfTransferOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
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

      <Modal title="Edit fund deposit" isOpen={selectedDeposit !== null} onClose={closeEditModal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Fund Account *</span>
            <input
              value={formState.fund_account}
              onChange={(event) => setFormState((current) => ({ ...current, fund_account: event.target.value }))}
              className="input-field"
              type="text"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Deposited Fund</span>
            <input
              value={formState.deposited_fund}
              className="input-field cursor-not-allowed opacity-50"
              type="number"
              min="0"
              disabled
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Budgeted Fund</span>
            <input
              value={formState.budgeted_fund}
              onChange={(event) => setFormState((current) => ({ ...current, budgeted_fund: event.target.value }))}
              className="input-field"
              type="number"
              min="0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Mode of Transfer</span>
            <input
              value={formState.mode_of_transfer}
              onChange={(event) => setFormState((current) => ({ ...current, mode_of_transfer: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Remarks</span>
            <textarea
              value={formState.remarks}
              onChange={(event) => setFormState((current) => ({ ...current, remarks: event.target.value }))}
              className="input-field min-h-24"
              rows={4}
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
            {editFiles.length > 0 ? <p className="text-xs text-slate-300">{getFileLabel(editFiles)}</p> : null}
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

      <Modal title="Add fund deposit" isOpen={isAddModalOpen} onClose={closeAddModal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Fund Account *</span>
            <input
              value={addFormState.fund_account}
              onChange={(event) => setAddFormState((current) => ({ ...current, fund_account: event.target.value }))}
              className="input-field"
              type="text"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Opening Balance *</span>
            <input
              value={addFormState.opening_balance}
              onChange={(event) => setAddFormState((current) => ({ ...current, opening_balance: event.target.value }))}
              className="input-field"
              type="number"
              min="0"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Deposit Fund</span>
            <input
              value={addFormState.deposited_fund}
              onChange={(event) => setAddFormState((current) => ({ ...current, deposited_fund: event.target.value }))}
              className="input-field"
              type="number"
              min="0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Budgeted Fund</span>
            <input
              value={addFormState.budgeted_fund}
              onChange={(event) => setAddFormState((current) => ({ ...current, budgeted_fund: event.target.value }))}
              className="input-field"
              type="number"
              min="0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Mode of Transfer</span>
            <input
              value={addFormState.mode_of_transfer}
              onChange={(event) => setAddFormState((current) => ({ ...current, mode_of_transfer: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
            <span>Remarks</span>
            <textarea
              value={addFormState.remarks}
              onChange={(event) => setAddFormState((current) => ({ ...current, remarks: event.target.value }))}
              className="input-field min-h-24"
              rows={4}
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
            {addFiles.length > 0 ? <p className="text-xs text-slate-300">{getFileLabel(addFiles)}</p> : null}
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-modal-secondary" onClick={closeAddModal}>
            Cancel
          </button>
          <button type="button" className="btn-modal-primary" onClick={handleAddFund} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add Fund'}
          </button>
        </div>
      </Modal>


      <DepositFundModal
        isOpen={depositTarget !== null}
        onClose={closeDepositModal}
        onSave={handleDepositAmount}
        isSaving={isSaving}
        depositedFund={amountDepositFormState.deposited_fund}
        modeOfTransfer={amountDepositFormState.mode_of_transfer}
        onChangeDepositedFund={val => setAmountDepositFormState(current => ({ ...current, deposited_fund: val }))}
        onChangeModeOfTransfer={val => setAmountDepositFormState(current => ({ ...current, mode_of_transfer: val }))}
        showFileUpload={true}
        files={depositFiles}
        onFilesChange={setDepositFiles}
      />

      <ConfirmDialog
        title="Delete fund deposit"
        description="This will permanently delete the selected fund deposit record."
        isOpen={deleteTarget !== null}
        isLoading={isDeleting}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </section>
  )
}
