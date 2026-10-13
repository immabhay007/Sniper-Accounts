import { api } from '../api'

export type FundDepositPayload = {
  fund_account: string
  budgeted_fund: number
  deposited_fund: number
  opening_balance?: number
  date_of_deposit: string
  mode_of_transfer: string
  remarks: string
  added_by: number
  timezone: string
}

export type FundDepositAddAmountPayload = {
  deposited_fund: number
  date_of_deposit: string
  mode_of_transfer: string
  added_by: number
  timezone: string
}

export type FundDepositRecord = FundDepositPayload & {
  id: number
  total_spent: number
  running_balance: number
}

export type FundDepositAccountOption = {
  id: number
  fund_account: string
}

export type FundLedgerRecord = {
  fund_account_id: number
  opening_balance?: number
  transaction_date: string
  credit: number
  debit: number
  running_balance: number
  reference: string
  bill_file?: string | null
  bill_files?: string[] | null
  added_by: string
  id: number
}

const toFundDepositFormData = (payload: FundDepositPayload, files: File[] = []) => {
  const formData = new FormData()
  formData.append('fund_account', payload.fund_account)
  formData.append('budgeted_fund', String(payload.budgeted_fund))
  formData.append('deposited_fund', String(payload.deposited_fund))
  formData.append('opening_balance', String(payload.opening_balance ?? 0))
  formData.append('date_of_deposit', payload.date_of_deposit)
  formData.append('mode_of_transfer', payload.mode_of_transfer)
  formData.append('remarks', payload.remarks ?? '')
  formData.append('added_by', String(payload.added_by ?? ''))
  formData.append('timezone', payload.timezone)

  files.forEach((file) => {
    formData.append('bills', file)
  })

  return formData
}

const toAddAmountFormData = (payload: FundDepositAddAmountPayload, files: File[] = []) => {
  const formData = new FormData()
  formData.append('deposited_fund', String(payload.deposited_fund))
  formData.append('date_of_deposit', payload.date_of_deposit)
  formData.append('mode_of_transfer', payload.mode_of_transfer)
  formData.append('added_by', String(payload.added_by ?? ''))
  formData.append('timezone', payload.timezone)

  files.forEach((file) => {
    formData.append('bills', file)
  })

  return formData
}

export type FundDepositSummary = {
  total_deposited: number
  total_spent: number
  net_balance: number
}

export type FundDepositListResponse = {
  data: FundDepositRecord[]
  summary: FundDepositSummary
}

export const fundDepositEndpoints = {
  list: (userId: number, fromDate?: string, toDate?: string) => {
    const query = new URLSearchParams({ user_id: String(userId) })
    if (fromDate) query.set('from_date', fromDate)
    if (toDate) query.set('to_date', toDate)
    return api.get<FundDepositListResponse>(`/v1/fund-deposits?${query.toString()}`)
  },
  create: (payload: FundDepositPayload, files: File[] = []) =>
    api.post('/v1/fund-deposits/', toFundDepositFormData(payload, files)),
  update: (payload: FundDepositPayload, id: number, files: File[] = []) =>
    api.put(`/v1/fund-deposits/${id}`, files.length > 0 ? toFundDepositFormData(payload, files) : payload),
  addAmount: (payload: FundDepositAddAmountPayload, id: number, files: File[] = []) =>
    api.put(`/v1/fund-deposits/${id}/add-amount`, toAddAmountFormData(payload, files)),
  remove: (id: number) => api.delete(`/v1/fund-deposits/${id}`),
  accounts: () => api.get<FundDepositAccountOption[]>('/v1/fund-deposits/accounts'),
  history: (fundAccountId: number, fromDate?: string, toDate?: string) => {
    const query = new URLSearchParams({ fund_account_id: String(fundAccountId) })
    if (fromDate) query.set('from_date', fromDate)
    if (toDate) query.set('to_date', toDate)
    return api.get<FundLedgerRecord[]>(`/v1/fund-deposits/history/all?${query.toString()}`)
  },
}