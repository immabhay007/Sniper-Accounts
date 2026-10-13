import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GlassDataTable, type GlassColumn } from '../components/GlassDataTable'
import { GlassModal } from '../components/GlassModal'
import { MetricCard } from '../components/MetricCard'
import { SectionHeader } from '../components/SectionHeader'
import { SectionLoader } from '../components/SectionLoader'
import { useAlerts } from '../components/alerts/useAlerts'
import { usePageHeaderActions } from '../layout/pageHeaderActionsContext'
import { dashboardEndpoints, type DashboardResponse, type FundAmountWise } from '../services/endpoints/dashboardEndpoints'
import { fundDepositEndpoints } from '../services/endpoints/fundDepositEndpoints'
import { formatCurrency } from '../utils/format'
import { DATE_PRESET_OPTIONS, getPresetFromRange, getPresetRange, type DatePreset } from '../utils/dateFilters'

const displayDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const getStatusClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'healthy':
      return 'status-success'
    case 'low':
      return 'status-warning'
    case 'overspent':
      return 'status-danger'
    default:
      return 'status-neutral'
  }
}

const CHART_COLORS = {
  deposited: '#2563eb',
  spent: '#f59e0b',
  balance: '#14b8a6',
  budget: '#7c3aed',
}

const PIE_COLORS = ['#2563eb', '#14b8a6', '#7c3aed', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#22c55e']

const safeNumber = (value: number | null | undefined): number => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export const DashboardPage = () => {
  const navigate = useNavigate()
  const { pushAlert } = useAlerts()
  const { setActions } = usePageHeaderActions()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState<string>(() => getPresetRange('month')[0])
  const [toDate, setToDate] = useState<string>(() => getPresetRange('month')[1])
  const [filterPreset, setFilterPreset] = useState<DatePreset>('month')
  const [filterFromDate, setFilterFromDate] = useState<string>(fromDate)
  const [filterToDate, setFilterToDate] = useState<string>(toDate)
  const [isFilterOpen, setFilterOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadDashboard = async () => {
      setLoading(true)
      try {
        const response = await dashboardEndpoints.get(fromDate, toDate)
        if (isMounted) {
          setData(response.data)
        }
      } catch (error) {
        console.error('Failed to load dashboard', error)
        if (isMounted) {
          pushAlert('Unable to load dashboard data.', 'error')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      isMounted = false
    }
  }, [fromDate, toDate, pushAlert])

  const openFilterModal = useCallback(() => {
    setFilterPreset(getPresetFromRange(fromDate, toDate))
    setFilterFromDate(fromDate)
    setFilterToDate(toDate)
    setFilterOpen(true)
  }, [fromDate, toDate])

  const closeFilterModal = useCallback(() => {
    setFilterOpen(false)
  }, [])

  const handleApplyFilters = useCallback(() => {
    if (!filterFromDate || !filterToDate) {
      pushAlert('Please select both custom dates.', 'warning')
      return
    }

    if (filterFromDate > filterToDate) {
      pushAlert('Start date must be before end date.', 'error')
      return
    }

    setFromDate(filterFromDate)
    setToDate(filterToDate)
    setFilterOpen(false)
  }, [filterFromDate, filterToDate, pushAlert])

  const handleFilterPresetChange = useCallback((preset: DatePreset) => {
    setFilterPreset(preset)

    if (preset === 'custom') {
      return
    }

    const [nextFrom, nextTo] = getPresetRange(preset)
    setFilterFromDate(nextFrom)
    setFilterToDate(nextTo)
  }, [])

  useEffect(() => {
    setActions(
      <button type="button" className="btn-primary" onClick={openFilterModal}>
        Filter
      </button>,
    )

    return () => setActions(null)
  }, [openFilterModal, setActions])

  const fundRows = data?.fund_amount_wise ?? []
  const summary = data?.summary

  const kpiCards = useMemo(
    () => [
      {
        label: 'Total Deposited',
        value: formatCurrency(summary?.total_deposited ?? 0),
        note: 'Funds received in range',
        tone: 'positive' as const,
      },
      {
        label: 'Total Spent',
        value: formatCurrency(summary?.total_spent ?? 0),
        note: 'Expense outflow in range',
        tone: 'warning' as const,
      },
      {
        label: 'Net Balance',
        value: formatCurrency(summary?.net_balance ?? 0),
        note: (summary?.net_balance ?? 0) >= 0 ? 'Healthy liquidity' : 'Needs attention',
        tone: (summary?.net_balance ?? 0) >= 0 ? 'positive' as const : 'danger' as const,
      },
      {
        label: 'Active Accounts',
        value: `${fundRows.length}`,
        note: 'Fund accounts in report',
        tone: 'neutral' as const,
      },
    ],
    [fundRows.length, summary?.net_balance, summary?.total_deposited, summary?.total_spent],
  )

  const comparisonChartData = useMemo(
    () =>
      fundRows.map((row) => ({
        fund_amount: row.fund_amount,
        deposited_amount: safeNumber(row.deposited_amount),
        total_spent: safeNumber(row.total_spent),
        balance_remaining: safeNumber(row.balance_remaining),
      })),
    [fundRows],
  )

  const distributionChartData = useMemo(
    () =>
      fundRows
        .map((row) => ({
          name: row.fund_amount,
          value: safeNumber(row.total_spent),
        }))
        .filter((item) => item.value > 0),
    [fundRows],
  )

  const budgetVsDepositedChartData = useMemo(
    () =>
      fundRows.map((row) => ({
        fund_amount: row.fund_amount,
        budgeted_amount: safeNumber(row.budgeted_amount),
        deposited_amount: safeNumber(row.deposited_amount),
      })),
    [fundRows],
  )

  const balanceRemainingChartData = useMemo(
    () =>
      fundRows.map((row) => ({
        fund_amount: row.fund_amount,
        balance_remaining: safeNumber(row.balance_remaining),
      })),
    [fundRows],
  )

  const handleFundAccountClick = async (fundAccountName: string) => {
    try {
      const response = await fundDepositEndpoints.accounts()
      const account = response.data?.find((item) => item.fund_account === fundAccountName)

      if (!account) {
        pushAlert('Unable to open fund ledger.', 'error')
        return
      }

      navigate(`/fund-ledger/${account.id}/${encodeURIComponent(account.fund_account)}`, {
        state: { source: 'dashboard' },
      })
    } catch (error) {
      console.error('Failed to resolve fund account for dashboard navigation', error)
      pushAlert('Unable to open fund ledger.', 'error')
    }
  }

  const tableColumns: GlassColumn<FundAmountWise>[] = [
    {
      key: 'row',
      header: 'No',
      render: (_, index) => <span className="font-semibold text-slate-500">{index + 1}</span>,
      className: 'w-16',
    },
    {
      key: 'fund_amount',
      header: 'Fund Account',
      render: (row) => (
        <button
          type="button"
          className="table-link"
          onClick={() => void handleFundAccountClick(row.fund_amount)}
        >
          {row.fund_amount}
        </button>
      ),
    },
    {
      key: 'budgeted_amount',
      header: 'Budgeted',
      render: (row) => formatCurrency(row.budgeted_amount),
    },
    {
      key: 'deposited_amount',
      header: 'Deposited',
      render: (row) => formatCurrency(row.deposited_amount),
    },
    {
      key: 'total_spent',
      header: 'Spent',
      render: (row) => formatCurrency(row.total_spent),
    },
    {
      key: 'balance_remaining',
      header: 'Balance Remaining',
      render: (row) => formatCurrency(row.balance_remaining),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={getStatusClass(row.status)}>
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </span>
      ),
    },
  ]

  return (
    <section className="space-y-5">
      <div className="text-sm text-slate-600">
        <p>
          Showing data from <span className="font-bold text-slate-800">{displayDate(fromDate)}</span> to{' '}
          <span className="font-bold text-slate-800">{displayDate(toDate)}</span>
        </p>
      </div>

      {isLoading ? (
        <SectionLoader message="Preparing premium analytics dashboard..." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} tone={card.tone} />
            ))}
          </div>

          <section className="space-y-3">
            <SectionHeader
              title="Fund Analytics"
              subtitle="Visual comparison of deposits, spending, and remaining balances by fund account."
            />

            {comparisonChartData.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <article className="glass-section h-[21rem]">
                  <p className="mb-3 text-sm font-semibold text-slate-700">Deposited vs Spent vs Balance</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonChartData} margin={{ top: 12, right: 16, left: 8, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(100,116,139,0.22)" />
                      <XAxis
                        dataKey="fund_amount"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        tickMargin={10}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={66}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickMargin={8} width={72} />
                      <Tooltip formatter={(value) => formatCurrency(safeNumber(Number(value ?? 0)))} />
                      <Legend wrapperStyle={{ paddingBottom: 8 }} />
                      <Bar dataKey="deposited_amount" name="Deposited" fill={CHART_COLORS.deposited} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_spent" name="Spent" fill={CHART_COLORS.spent} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="balance_remaining" name="Balance" fill={CHART_COLORS.balance} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </article>

                <article className="glass-section h-[21rem]">
                  <p className="mb-3 text-sm font-semibold text-slate-700">Spend Distribution</p>
                  {distributionChartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 8, right: 12, left: 12, bottom: 24 }}>
                        <Pie
                          data={distributionChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="45%"
                          innerRadius={62}
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {distributionChartData.map((entry, index) => (
                            <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(safeNumber(Number(value ?? 0)))} />
                        <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 10, paddingBottom: 6 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No chartable distribution data for the selected range.
                    </div>
                  )}
                </article>

                <article className="glass-section h-[21rem]">
                  <p className="mb-3 text-sm font-semibold text-slate-700">Budget vs Deposited</p>
                  {budgetVsDepositedChartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={budgetVsDepositedChartData} margin={{ top: 12, right: 16, left: 8, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(100,116,139,0.22)" />
                        <XAxis
                          dataKey="fund_amount"
                          tick={{ fontSize: 11, fill: '#475569' }}
                          tickMargin={10}
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                          height={66}
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickMargin={8} width={72} />
                        <Tooltip formatter={(value) => formatCurrency(safeNumber(Number(value ?? 0)))} />
                        <Legend wrapperStyle={{ paddingBottom: 6 }} />
                        <Bar dataKey="budgeted_amount" name="Budgeted" fill="#f97316" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="deposited_amount" name="Deposited" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No budget comparison data available for the selected range.
                    </div>
                  )}
                </article>

                <article className="glass-section h-[21rem]">
                  <p className="mb-3 text-sm font-semibold text-slate-700">Balance Remaining</p>
                  {balanceRemainingChartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={balanceRemainingChartData} margin={{ top: 12, right: 16, left: 8, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(100,116,139,0.22)" />
                        <XAxis
                          dataKey="fund_amount"
                          tick={{ fontSize: 11, fill: '#475569' }}
                          tickMargin={10}
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                          height={66}
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickMargin={8} width={72} />
                        <Tooltip formatter={(value) => formatCurrency(safeNumber(Number(value ?? 0)))} />
                        <Legend wrapperStyle={{ paddingBottom: 6 }} />
                        <Bar dataKey="balance_remaining" name="Balance Remaining" fill={CHART_COLORS.balance} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No balance data available for the selected range.
                    </div>
                  )}
                </article>
              </div>
            ) : (
              <div className="glass-section text-sm text-slate-500">No chartable fund data available for the selected range.</div>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Fund Performance Table"
              subtitle="Gradient-styled data table with pagination and quick visibility into fund performance."
            />
            <GlassDataTable data={fundRows} columns={tableColumns} emptyMessage="No fund records in selected period." pageSize={7} rowKey={(item) => item.fund_amount} />
          </section>
        </>
      )}

      <GlassModal
        title="Filter Dashboard"
        isOpen={isFilterOpen}
        onClose={closeFilterModal}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={closeFilterModal}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleApplyFilters}>
              Apply
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
            Date Filter
            <select className="input" value={filterPreset} onChange={(event) => handleFilterPresetChange(event.target.value as DatePreset)}>
              {DATE_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {filterPreset === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="input !w-auto" value={filterFromDate} onChange={(event) => setFilterFromDate(event.target.value)} />
              <span className="text-sm text-slate-500">to</span>
              <input type="date" className="input !w-auto" value={filterToDate} onChange={(event) => setFilterToDate(event.target.value)} />
            </div>
          ) : null}
        </div>
      </GlassModal>

    </section>
  )
}
