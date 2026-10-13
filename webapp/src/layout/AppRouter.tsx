import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { AccountsPage } from '../pages/AccountsPage'
import { BalanceSheetPage } from '../pages/BalanceSheetPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ExpensesPage } from '../pages/ExpensesPage'
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage'
import { FundPage } from '../pages/FundPage'
import { FundLedgerPage } from '../pages/FundLedgerPage'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import { ReportsPage } from '../pages/ReportsPage'
import { UsersPage } from '../pages/UsersPage'

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="fund" element={<FundPage />} />
          <Route path="fund-ledger/:fundAccountId/:fundAccountName" element={<FundLedgerPage />} />
          <Route path="fund-ledger/:fundAccountId" element={<FundLedgerPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="balance-sheet" element={<BalanceSheetPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
