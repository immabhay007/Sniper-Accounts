import { LayoutDashboard, Landmark, ReceiptText, Users } from 'lucide-react'

export type NavigationItem = {
  label: string
  path: string
  icon: typeof LayoutDashboard
}

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Funds', path: '/fund', icon: Landmark },
  { label: 'Expenses', path: '/expenses', icon: ReceiptText },
  { label: 'Users', path: '/users', icon: Users },
]
