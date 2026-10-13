import { api } from '../api'

export type DashboardSummary = {
  total_deposited: number
  total_spent: number
  net_balance: number
}

export type FundAmountWise = {
  fund_amount: string
  budgeted_amount: number
  deposited_amount: number
  total_spent: number
  balance_remaining: number
  status: string
}

export type DashboardResponse = {
  summary: DashboardSummary
  fund_amount_wise: FundAmountWise[]
}

export const dashboardEndpoints = {
  get: (fromDate: string, toDate: string, userId = 0) =>
    api.get<DashboardResponse>(`/v1/dashboard?from_date=${fromDate}&to_date=${toDate}&user_id=${userId}`),
}
