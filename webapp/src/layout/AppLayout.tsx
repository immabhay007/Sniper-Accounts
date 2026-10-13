import { ChevronDown, Eye, EyeOff, KeyRound, LogOut, User, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { useAlerts } from '../components/alerts/useAlerts'
import { navigationItems } from '../config/navigation'
import { userEndpoints } from '../services/endpoints/userEndpoints'
import { tokenStorage } from '../utils/storage'
import { PageHeaderActionsProvider } from './pageHeaderActionsContext'

export const AppLayout = () => {
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false)
  const [isMobileNavOpen, setMobileNavOpen] = useState(false)
  const [pageHeaderActions, setPageHeaderActions] = useState<ReactNode | null>(null)
  const [pageHeaderTitle, setPageHeaderTitle] = useState<string | null>(null)
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 0, right: 0 })
  const [isChangePasswordOpen, setChangePasswordOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isUpdatingPassword, setUpdatingPassword] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const { pushAlert } = useAlerts()
  const location = useLocation()
  const navigate = useNavigate()

  const authUser = useMemo(() => tokenStorage.getAuthUser()?.user ?? null, [])
  const userName = useMemo(() => {
    if (!authUser) return 'Account'
    if (authUser.full_name?.trim()) return authUser.full_name.trim()
    const fallback = `${authUser.first_name ?? ''} ${authUser.last_name ?? ''}`.trim()
    return fallback || 'Account'
  }, [authUser])
  const userInitial = useMemo(() => {
    const firstChar = userName.trim().charAt(0)
    return firstChar ? firstChar.toUpperCase() : 'A'
  }, [userName])

  const pageTitle = useMemo(() => {
    if (pageHeaderTitle?.trim()) {
      return pageHeaderTitle.trim()
    }

    const found = navigationItems.find((item) => {
      if (item.path === '/') {
        return location.pathname === '/'
      }
      return location.pathname.startsWith(item.path)
    })

    if (location.pathname.startsWith('/fund-ledger')) {
      return 'Fund Ledger'
    }

    return found?.label ?? 'Dashboard'
  }, [location.pathname, pageHeaderTitle])

  const handleLogout = () => {
    tokenStorage.clear()
    navigate('/login', { replace: true })
  }

  const openChangePasswordModal = () => {
    setOldPassword('')
    setNewPassword('')
    setShowOldPassword(false)
    setShowNewPassword(false)
    setChangePasswordOpen(true)
  }

  const closeChangePasswordModal = () => {
    if (isUpdatingPassword) return
    setChangePasswordOpen(false)
    setOldPassword('')
    setNewPassword('')
    setShowOldPassword(false)
    setShowNewPassword(false)
  }

  const handleChangePassword = async () => {
    if (!authUser) {
      pushAlert('Unable to determine current user.', 'error')
      return
    }

    if (!oldPassword || !newPassword) {
      pushAlert('Both fields are required.', 'error')
      return
    }

    try {
      setUpdatingPassword(true)
      await userEndpoints.updatePassword(authUser.id, {
        old_password: oldPassword,
        new_password: newPassword,
      })
      pushAlert('Password updated successfully.', 'success')
      closeChangePasswordModal()
    } catch (error) {
      console.error('Failed to update password', error)
      pushAlert('Unable to update password.', 'error')
    } finally {
      setUpdatingPassword(false)
    }
  }

  useEffect(() => {
    if (!isProfileMenuOpen) return

    const rect = profileButtonRef.current?.getBoundingClientRect()
    if (rect) {
      setProfileMenuPosition({
        top: rect.bottom + window.scrollY + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        profileButtonRef.current &&
        !profileButtonRef.current.contains(target) &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setProfileMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
        profileButtonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const mobileNavLinks = (
    <nav className="flex flex-col gap-2">
      {navigationItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `inline-flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-base font-semibold transition ${
                isActive
                  ? 'border-blue-200 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700'
                  : 'border-transparent text-slate-600 hover:border-white/80 hover:bg-white/75 hover:text-slate-800'
              }`
            }
            title={item.label}
            aria-label={item.label}
            onClick={() => setMobileNavOpen(false)}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )

  const desktopNavLinks = (
    <nav className="hidden items-center justify-start gap-2 overflow-x-auto whitespace-nowrap lg:flex">
      {navigationItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-base font-semibold whitespace-nowrap transition ${
                isActive
                  ? 'border-blue-200 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700'
                  : 'border-transparent text-slate-600 hover:border-white/80 hover:bg-white/75 hover:text-slate-800'
              }`
            }
            title={item.label}
            aria-label={item.label}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )

  return (
    <PageHeaderActionsProvider
      value={{
        actions: pageHeaderActions,
        setActions: setPageHeaderActions,
        title: pageHeaderTitle,
        setTitle: setPageHeaderTitle,
      }}
    >
    <div className="app-page">
      <div className="orbs-layer">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
        <span className="orb orb-4" />
        <span className="orb orb-5" />
      </div>

      <div className="relative z-10 min-h-screen">

        {isMobileNavOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close mobile menu"
            />
            <aside className="glass-card absolute inset-y-3 left-3 w-[18.5rem] p-4">
              <div className="mb-4 flex items-center justify-between border-b border-white/70 pb-3">
                <span className="text-sm font-bold text-slate-800">Navigation</span>
                <button
                  type="button"
                  className="btn btn-outline !rounded-full !px-2 !py-2"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {mobileNavLinks}
            </aside>
          </div>
        ) : null}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6">
            <div className="glass-card px-4 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center gap-2">
                  

                  <span className="inline-flex items-center px-2">
                    <img
                      src="/sniper-ai-logo.jpg"
                      alt="Sniper logo"
                      className="h-13 w-auto"
                    />
                  </span>
                </div>

                <div className="min-w-0 flex-1">{desktopNavLinks}</div>

                <div className="ml-auto flex justify-end">
                  <button
                    ref={profileButtonRef}
                    type="button"
                    className="inline-flex max-w-[14rem] items-center gap-2 rounded-full border border-white/80 bg-white/75 px-2.5 py-1.5 text-slate-700 transition hover:bg-white"
                    onClick={() => setProfileMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={isProfileMenuOpen}
                    aria-controls="profile-menu"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-xs font-bold text-white">
                      {userInitial.match(/[A-Z]/) ? userInitial : <User className="h-4 w-4" />}
                    </span>
                    <span className="truncate text-sm font-semibold">{userName}</span>
                    <ChevronDown className={`h-4 w-4 transition ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-card mt-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="gradient-title mt-1 truncate text-xl font-extrabold sm:text-2xl">{pageTitle}</p>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                  {pageHeaderActions}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-8 pt-5 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>

      {isProfileMenuOpen
        ? createPortal(
            <div
              id="profile-menu"
              ref={profileMenuRef}
              role="menu"
              style={{ top: profileMenuPosition.top, right: profileMenuPosition.right }}
              className="glass-card fixed z-[9999] min-w-48 p-1"
            >
              <button
                type="button"
                role="menuitem"
                className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-white/75"
                onClick={() => {
                  setProfileMenuOpen(false)
                  openChangePasswordModal()
                }}
              >
                <KeyRound className="h-4 w-4" />
                Change password
              </button>
              <button
                type="button"
                role="menuitem"
                className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                onClick={() => {
                  setProfileMenuOpen(false)
                  handleLogout()
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>,
            document.body,
          )
        : null}

      <Modal title="Change Password" isOpen={isChangePasswordOpen} onClose={closeChangePasswordModal} size="md">
        <div className="grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            <span>Old Password</span>
            <div className="relative flex items-center">
              <input
                type={showOldPassword ? 'text' : 'password'}
                className="input pr-10"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                tabIndex={-1}
                onClick={() => setShowOldPassword((value) => !value)}
                aria-label={showOldPassword ? 'Hide password' : 'Show password'}
              >
                {showOldPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-2 text-sm text-slate-700">
            <span>New Password</span>
            <div className="relative flex items-center">
              <input
                type={showNewPassword ? 'text' : 'password'}
                className="input pr-10"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                tabIndex={-1}
                onClick={() => setShowNewPassword((value) => !value)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-outline" onClick={closeChangePasswordModal} disabled={isUpdatingPassword}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={isUpdatingPassword || !oldPassword || !newPassword || !authUser}
            onClick={handleChangePassword}
          >
            {isUpdatingPassword ? 'Updating...' : 'Update'}
          </button>
        </div>
      </Modal>
    </div>
    </PageHeaderActionsProvider>
  )
}
