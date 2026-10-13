import { useState } from 'react'
import { Modal } from '../components/Modal'
import { useAlerts } from '../components/alerts/useAlerts'
import { userEndpoints } from '../services/endpoints/userEndpoints'

const emptyFormState = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'SUPPORT',
  password: '',
}

export const RegisterUserModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { pushAlert } = useAlerts()
  const [formState, setFormState] = useState({ ...emptyFormState })
  const [isSaving, setSaving] = useState(false)

  const validateRequired = (state: typeof emptyFormState) => {
    return Boolean(
      state.email.trim() &&
        state.first_name.trim() &&
        state.last_name.trim() &&
        state.phone.trim() &&
        state.role.trim() &&
        state.password,
    )
  }

  const handleAddUser = async () => {
    if (!validateRequired(formState)) {
      pushAlert('All fields are required for creating user.', 'error')
      return
    }
    setSaving(true)
    try {
      await userEndpoints.create(formState)
      pushAlert('User registered successfully.', 'success')
      onClose()
      setFormState({ ...emptyFormState })
    } catch (error) {
      pushAlert('Unable to register user.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Register User" isOpen={isOpen} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span>First Name *</span>
          <input
            value={formState.first_name}
            onChange={(event) => setFormState((current) => ({ ...current, first_name: event.target.value }))}
            className="input-field"
            type="text"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span>Last Name *</span>
          <input
            value={formState.last_name}
            onChange={(event) => setFormState((current) => ({ ...current, last_name: event.target.value }))}
            className="input-field"
            type="text"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200 sm:max-w-md">
          <span>Email *</span>
          <input
            value={formState.email}
            onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
            className="input-field"
            type="email"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span>Phone</span>
          <input
            value={formState.phone}
            onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
            className="input-field"
            type="text"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span>Role</span>
          <select
            value={formState.role}
            onChange={(event) =>
              setFormState((current) => ({ ...current, role: event.target.value === 'ADMIN' ? 'ADMIN' : 'SUPPORT' }))
            }
            className="input-field"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="SUPPORT">SUPPORT</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200 sm:col-span-2">
          <span>Password *</span>
          <input
            value={formState.password}
            onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
            className="input-field"
            type="password"
            required
          />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleAddUser} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Register'}
        </button>
      </div>
    </Modal>
  )
}
