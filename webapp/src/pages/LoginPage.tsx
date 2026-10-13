import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { tokenStorage } from '../utils/storage'
import { useAlerts } from '../components/alerts/useAlerts'
import { APP_NAME } from '../config/env'
import { authEndpoints } from '../services/endpoints'

type LoginScreen = 'login' | 'forgot-email' | 'forgot-otp' | 'forgot-new-password'
type FlowFeedbackTone = 'success' | 'warning' | 'error'

type FlowFeedback = {
  tone: FlowFeedbackTone
  message: string
}

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { pushAlert } = useAlerts()
  const [screen, setScreen] = useState<LoginScreen>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [flowFeedback, setFlowFeedback] = useState<FlowFeedback | null>(null)

  const isTransientLoginError = (error: unknown): boolean => {
    if (!isAxiosError(error)) {
      return false
    }

    const errorCode = (error.code ?? '').toUpperCase()
    return !error.response && (errorCode === 'ECONNABORTED' || errorCode === 'ERR_CANCELED' || errorCode === 'ERR_NETWORK')
  }

  const feedbackClassMap: Record<FlowFeedbackTone, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-slate-900',
    warning: 'border-amber-200 bg-amber-50 text-slate-900',
    error: 'border-rose-200 bg-rose-50 text-slate-900',
  }

  const setForgotFlowFeedback = (tone: FlowFeedbackTone, message: string) => {
    setFlowFeedback({ tone, message })
    pushAlert(message, tone)
  }

  const resetForgotFlow = () => {
    setForgotEmail('')
    setOtp('')
    setNewPassword('')
    setConfirmPassword('')
    setFlowFeedback(null)
    setSubmitting(false)
    setScreen('login')
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setSubmitting(true)

    try {
      const loginPayload = {
        email: email.trim(),
        password,
      }

      let response: Awaited<ReturnType<typeof authEndpoints.login>> | null = null

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await authEndpoints.login(loginPayload)
          break
        } catch (error) {
          if (!isTransientLoginError(error) || attempt > 0) {
            throw error
          }
        }
      }

      if (!response) {
        throw new Error('Login request failed before receiving a response')
      }

      const loginData = response.data

      tokenStorage.clear()
      tokenStorage.setAccessToken(loginData.access_token)
      tokenStorage.setRefreshToken(loginData.refresh_token)
      tokenStorage.setAuthUser(loginData)
      pushAlert('Signed in successfully.', 'success')

      const nextPath = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(nextPath, { replace: true })
    } catch (error) {
      if (isTransientLoginError(error)) {
        pushAlert('Login request timed out or was canceled. Please try again.', 'error')
        return
      }

      const status = isAxiosError(error) ? error.response?.status : undefined
      if (status === 400 || status === 401 || status === 403 || status === 422) {
        const detail = isAxiosError(error) ? error.response?.data?.detail : undefined
        if (typeof detail === 'string' && detail.trim()) {
          pushAlert(detail, 'error')
        } else {
          pushAlert('Wrong credentials.', 'error')
        }
      } else {
        pushAlert('Unable to sign in.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!forgotEmail.trim()) {
      setForgotFlowFeedback('error', 'Email is required.')
      return
    }

    setSubmitting(true)
    setFlowFeedback(null)
    try {
      const response = await authEndpoints.forgotPassword({ email: forgotEmail.trim() })
      const message = response?.data?.message ?? 'Request completed.'
      if (typeof message === 'string' && message.toLowerCase().includes('otp sent')) {
        setForgotFlowFeedback('success', message)
        setScreen('forgot-otp')
      } else {
        setForgotFlowFeedback('warning', message)
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.response?.data?.detail || 'Unable to send OTP.'
      setForgotFlowFeedback('error', message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!otp.trim()) {
      setForgotFlowFeedback('error', 'OTP is required.')
      return
    }

    setSubmitting(true)
    setFlowFeedback(null)
    try {
      const response = await authEndpoints.resetPassword({ otp: otp.trim() })
      const status = Boolean(response?.data?.status)
      const message = response?.data?.message || (status ? 'OTP verified successfully.' : 'Invalid OTP.')
      if (status) {
        setForgotFlowFeedback('success', message)
        setScreen('forgot-new-password')
      } else {
        setForgotFlowFeedback('error', message)
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.response?.data?.detail || 'Unable to verify OTP.'
      setForgotFlowFeedback('error', message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!otp.trim()) {
      setForgotFlowFeedback('error', 'OTP is missing. Please restart forgot password flow.')
      setScreen('forgot-otp')
      return
    }

    if (!newPassword || !confirmPassword) {
      setForgotFlowFeedback('error', 'Both password fields are required.')
      return
    }

    if (newPassword !== confirmPassword) {
      setForgotFlowFeedback('error', 'Passwords do not match.')
      return
    }

    setSubmitting(true)
    setFlowFeedback(null)
    try {
      const response = await authEndpoints.updateWithOtp({
        otp: otp.trim(),
        new_password: newPassword,
      })

      const status = Boolean(response?.data?.status)
      const message = response?.data?.message || (status ? 'Password updated successfully.' : 'Invalid OTP.')
      setForgotFlowFeedback(status ? 'success' : 'error', message)
      resetForgotFlow()
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.response?.data?.detail || 'Unable to update password.'
      setForgotFlowFeedback('error', message)
      resetForgotFlow()
    }
  }

  const headerTitle =
    screen === 'login'
      ? 'Sign in'
      : screen === 'forgot-email'
        ? 'Forgot password'
        : screen === 'forgot-otp'
          ? 'Confirm OTP'
          : 'Set new password'

  const headerSubtitle =
    screen === 'login'
      ? 'Use your account credentials to access the finance workspace.'
      : screen === 'forgot-email'
        ? 'Enter your registered email to receive a one-time password.'
        : screen === 'forgot-otp'
          ? 'Enter the OTP sent to your email and confirm it.'
          : 'Create a new password and update your account.'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-10">
      <span className="bg-orb left-[-4rem] top-16 h-52 w-52 bg-emerald-300/45" />
      <span className="bg-orb right-[-5rem] bottom-14 h-64 w-64 bg-cyan-300/45" />

      <div className="glass-card relative z-10 w-full max-w-md p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-700">{APP_NAME}</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{headerTitle}</h1>
        <p className="mt-2 text-sm text-slate-700">{headerSubtitle}</p>

        {screen !== 'login' && flowFeedback ? (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${feedbackClassMap[flowFeedback.tone]}`}>
            {flowFeedback.message}
          </div>
        ) : null}

        {screen === 'login' ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-800">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input-glass"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-800">
                  Password
                </label>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-glass"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <label htmlFor="show-password" className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    id="show-password"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                  />
                  Show password
                </label>
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-slate-700">
              <button
                type="button"
                className="underline decoration-blue-300 underline-offset-4"
                onClick={() => {
                  setForgotEmail(email.trim())
                  setFlowFeedback(null)
                  setScreen('forgot-email')
                }}
              >
                Forgot password?
              </button>
            </div>
          </>
        ) : null}

        {screen === 'forgot-email' ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
              <div>
                <label htmlFor="forgot-email" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-800">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  className="input-glass"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-slate-700">
              <button type="button" className="underline decoration-blue-300 underline-offset-4" onClick={resetForgotFlow}>
                Back to login
              </button>
            </div>
          </>
        ) : null}

        {screen === 'forgot-otp' ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={handleConfirmOtp}>
              <div>
                <label htmlFor="otp" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-800">
                  OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  className="input-glass"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  autoComplete="one-time-code"
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Confirming...' : 'Confirm'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-slate-700">
              <button
                type="button"
                className="underline decoration-blue-300 underline-offset-4"
                onClick={() => {
                  setFlowFeedback(null)
                  setScreen('forgot-email')
                }}
              >
                Change email
              </button>
            </div>
          </>
        ) : null}

        {screen === 'forgot-new-password' ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={handleUpdatePassword}>
              <div>
                <label htmlFor="new-password" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-800">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  className="input-glass"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-800">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  className="input-glass"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Updating password...' : 'Update Password'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-slate-700">
              <button type="button" className="underline decoration-blue-300 underline-offset-4" onClick={resetForgotFlow}>
                Back to login
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
