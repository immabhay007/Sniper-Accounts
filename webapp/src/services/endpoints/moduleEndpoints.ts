import { api } from '../api'

export const moduleEndpoints = {
  dashboard: () => api.get('/dashboard/overview'),
  fund: () => api.get('/fund/summary'),
  accounts: () => api.get('/accounts/summary'),
  expenses: () => api.get('/expenses/summary'),
  reports: () => api.get('/reports/summary'),
  balanceSheet: () => api.get('/balance-sheet/summary'),
}
