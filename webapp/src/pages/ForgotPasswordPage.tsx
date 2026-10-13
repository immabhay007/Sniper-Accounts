import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAlerts } from '../components/alerts/useAlerts'
import { authEndpoints } from '../services/endpoints'

export const ForgotPasswordPage = () => {
  const { pushAlert } = useAlerts()
  const [email, setEmail] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)

    try {
      const response = await authEndpoints.forgotPassword({ email })
      // Try to show a message from the API response, fallback to a generic message if not present
      const message = response?.data?.message || response?.data?.detail || 'Request completed.'
      pushAlert(message, 'info')
      setEmail('')
    } catch (error: any) {
      // Try to show error message from API response, fallback to a generic error
      const message = error?.response?.data?.message || error?.response?.data?.detail || 'Reset request failed.'
      pushAlert(message, 'warning')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-10">
      <span className="bg-orb left-[-3rem] top-20 h-52 w-52 bg-cyan-300/45" />
      <span className="bg-orb right-[-4rem] bottom-16 h-56 w-56 bg-emerald-300/45" />

      <div className="glass-card relative z-10 w-full max-w-md p-6 sm:p-8">
        <h1 className="gradient-title text-3xl font-medium">Forgot password</h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter your email and we will trigger your backend reset workflow.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="reset-email" className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-300">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              className="input-glass"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending link...' : 'Send reset link'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-200">
          <Link to="/login" className="underline decoration-cyan-200/60 underline-offset-4">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
