import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  // Extract token from URL (?token=... or /reset-password/:token)
  let token = ''
  const searchParams = new URLSearchParams(location.search)
  if (searchParams.has('token')) {
    token = searchParams.get('token') || ''
  } else {
    // Try to extract from path: /reset-password/<token>
    const match = location.pathname.match(/reset-password\/?([^/]+)?$/)
    if (match && match[1]) token = match[1]
  }

  const handleUpdate = async () => {
    setError('')
    setMessage('')
    if (!token) {
      setError('Invalid or missing token.')
      return
    }
    setIsSaving(true)
    try {
      await api.post('/v1/users/reset-password', {
        token,
        new_password: newPassword,
      })
      setMessage('Password updated! Redirecting to login...')
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1200)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reset password.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        color: '#222',
      }}
    >
      <form
        onSubmit={e => {
          e.preventDefault()
          handleUpdate()
        }}
        style={{ background: '#fff', padding: 32, borderRadius: 8, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', minWidth: 320 }}
      >
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#222' }}>Reset Password</h2>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#444', fontSize: 15 }}>New Password</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 4, fontSize: 16, pointerEvents: 'auto', paddingRight: 38 }}
              required
              tabIndex={0}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                color: '#888',
                height: 24,
                width: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              tabIndex={-1}
            >
              {showPassword ? (
                // Eye-off SVG
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width={22} height={22}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10 0-1.657.403-3.22 1.125-4.575m2.122-2.122A9.956 9.956 0 0112 3c5.523 0 10 4.477 10 10 0 1.657-.403 3.22-1.125 4.575m-2.122 2.122A9.956 9.956 0 0112 21c-1.657 0-3.22-.403-4.575-1.125m0 0L3 21m0 0l18-18" /></svg>
              ) : (
                // Eye SVG
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width={22} height={22}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm-9.197 4.197A9.956 9.956 0 0112 21c5.523 0 10-4.477 10-10 0-1.657-.403-3.22-1.125-4.575m-2.122-2.122A9.956 9.956 0 0012 3c-1.657 0-3.22.403-4.575 1.125" /></svg>
              )}
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={isSaving || !newPassword}
          style={{ width: '100%', padding: 12, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 16, cursor: isSaving ? 'not-allowed' : 'pointer' }}
        >
          {isSaving ? 'Updating...' : 'Update'}
        </button>
        {error && <div style={{ marginTop: 18, color: '#dc2626', textAlign: 'center' }}>{error}</div>}
        {message && <div style={{ marginTop: 18, color: '#16a34a', textAlign: 'center' }}>{message}</div>}
      </form>
    </div>
  )
}
