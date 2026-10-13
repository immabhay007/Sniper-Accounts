import { api } from '../api'

export type ExpensePayload = {
  fund_account_id: number
  date_of_expense: string
  purpose: string
  withdrawn_amount: number
  returned_amount: number
  running_balance: number
  category_tage: string
  payment_by: string
  created_by: number
  updated_by: number
  updated_at: string
  bill_url: string
  timezone: string
}

export type ExpenseRecord = ExpensePayload & {
  id: number
  fund_account?: string
  created_by_name?: string
  updated_by_name?: string
  bills?: Array<{
    expense_id: number
    bill_url?: string | null
    id: number
    [key: string]: unknown
  }>
}

export type ExpenseListSummary = {
  latest_running_balance: number
}

export type ExpenseListResponse = {
  data: ExpenseRecord[]
  summary: ExpenseListSummary
}

const toExpenseFormData = (payload: ExpensePayload, files: File[] = []) => {
  const formData = new FormData()
  formData.append('fund_account_id', String(payload.fund_account_id))
  formData.append('date_of_expense', payload.date_of_expense)
  formData.append('purpose', payload.purpose)
  formData.append('withdrawn_amount', String(payload.withdrawn_amount))
  formData.append('returned_amount', String(payload.returned_amount ?? 0))
  formData.append('running_balance', String(payload.running_balance ?? 0))
  formData.append('category_tage', payload.category_tage)
  formData.append('payment_by', payload.payment_by)
  formData.append('created_by', String(payload.created_by))
  formData.append('updated_by', String(payload.updated_by))
  formData.append('updated_at', payload.updated_at)
  formData.append('bill_url', payload.bill_url)
  formData.append('timezone', payload.timezone)

  files.forEach((file) => {
    formData.append('bills', file)
  })

  return formData
}

export const expenseEndpoints = {
  list: (userId: number, fromDate?: string, toDate?: string) => {
    const query = new URLSearchParams({ user_id: String(userId) })
    if (fromDate) query.set('from_date', fromDate)
    if (toDate) query.set('to_date', toDate)
    return api.get<ExpenseListResponse>(`/v1/expenses?${query.toString()}`)
  },
  create: (payload: ExpensePayload, files: File[] = []) => api.post('/v1/expenses', toExpenseFormData(payload, files)),
  update: (payload: ExpensePayload, id: number, files: File[] = []) =>
    api.put(`/v1/expenses/${id}`, toExpenseFormData(payload, files)),
  remove: (id: number) => api.delete(`/v1/expenses/${id}`),
}