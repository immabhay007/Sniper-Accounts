import { useCallback, useEffect, useMemo, useState } from 'react'
import { PencilLine, Plus, Trash2 } from 'lucide-react'
import { AppTable } from '../components/AppTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { SectionHeader } from '../components/SectionHeader'
import { SectionLoader } from '../components/SectionLoader'
import { useAlerts } from '../components/alerts/useAlerts'
import { usePageHeaderActions } from '../layout/pageHeaderActionsContext'
import { userEndpoints, type UserPayload, type UserRecord } from '../services/endpoints/userEndpoints'
import { formatInUserTimezone } from '../utils/timezone'

const listUserId = 0

type UserFormState = {
  email: string
  first_name: string
  last_name: string
  phone: string
  role: 'ADMIN' | 'SUPPORT'
  password: string
}

const emptyFormState: UserFormState = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'SUPPORT',
  password: '',
}

const toPayload = (formState: UserFormState, includePassword = true): UserPayload => {
  return {
    email: formState.email.trim(),
    first_name: formState.first_name.trim(),
    last_name: formState.last_name.trim(),
    phone: formState.phone.trim(),
    role: formState.role,
    password: includePassword ? formState.password : ''
  }
}

export const UsersPage = () => {
  const { pushAlert } = useAlerts()
  const { setActions } = usePageHeaderActions()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [isLoading, setLoading] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const [isAddModalOpen, setAddModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null)
  const [formState, setFormState] = useState<UserFormState>(emptyFormState)
  const [addFormState, setAddFormState] = useState<UserFormState>(emptyFormState)

  const fetchUsers = async () => {
    try {
      const response = await userEndpoints.list(listUserId)
      setUsers(response.data ?? [])
    } catch (error) {
      console.error('Failed to load users', error)
      pushAlert('Unable to load users.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadUsers = async () => {
      setLoading(true)
      try {
        const response = await userEndpoints.list(listUserId)
        if (isMounted) {
          setUsers(response.data ?? [])
        }
      } catch (error) {
        console.error('Failed to load users', error)
        if (isMounted) {
          pushAlert('Unable to load users.', 'error')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isMounted = false
    }
  }, [pushAlert])

  const openEditModal = (user: UserRecord) => {
    setSelectedUser(user)
    setFormState({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'SUPPORT',
      password: '',
    })
  }

  const closeEditModal = () => {
    setSelectedUser(null)
    setFormState(emptyFormState)
  }

  const openAddModal = useCallback(() => {
    setAddFormState(emptyFormState)
    setAddModalOpen(true)
  }, [])

  const closeAddModal = () => {
    setAddModalOpen(false)
    setAddFormState(emptyFormState)
  }

  const validateRequired = (state: UserFormState): boolean => {
    return Boolean(
      state.email.trim() &&
        state.first_name.trim() &&
        state.last_name.trim() &&
        state.phone.trim() &&
        state.role.trim() &&
        state.password,
    )
  }

  const handleSave = async () => {
    if (!selectedUser) {
      pushAlert('Unable to determine which user to update.', 'error')
      return
    }

    // For edit, do not require password
    if (!formState.email.trim() || !formState.first_name.trim() || !formState.last_name.trim() || !formState.phone.trim() || !formState.role.trim()) {
      pushAlert('All fields except password are required for editing user.', 'error')
      return
    }

    setSaving(true)

    try {
      await userEndpoints.update(toPayload(formState, false), selectedUser.id)
      pushAlert('User updated successfully.', 'success')
      closeEditModal()
      setLoading(true)
      await fetchUsers()
    } catch (error) {
      console.error('Failed to update user', error)
      pushAlert('Unable to update user.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddUser = async () => {
    if (!validateRequired(addFormState)) {
      pushAlert('All fields are required for creating user.', 'error')
      return
    }

    setSaving(true)

    try {
      await userEndpoints.create(toPayload(addFormState))
      pushAlert('User created successfully.', 'success')
      closeAddModal()
      setLoading(true)
      await fetchUsers()
    } catch (error) {
      console.error('Failed to create user', error)
      pushAlert('Unable to create user.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)

    try {
      await userEndpoints.remove(deleteTarget.id)
      pushAlert('User deleted successfully.', 'success')
      setDeleteTarget(null)
      setLoading(true)
      await fetchUsers()
    } catch (error) {
      console.error('Failed to delete user', error)
      pushAlert('Unable to delete user.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const activeCount = useMemo(() => users.filter((u) => u.is_active).length, [users])
  const adminCount = useMemo(() => users.filter((u) => u.role === 'ADMIN').length, [users])

  useEffect(() => {
    setActions(
      <button type="button" className="btn-primary" onClick={openAddModal}>
        <Plus className="mr-2 h-4 w-4" />
        Add User
      </button>,
    )

    return () => setActions(null)
  }, [openAddModal, setActions])

  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Records" value={String(users.length)} note="Registered users" tone="neutral" />
        <MetricCard label="Active Users" value={String(activeCount)} note="Currently active" tone="positive" />
        <MetricCard label="Admins" value={String(adminCount)} note="Admin accounts" tone="warning" />
      </div>

      <section>
        <SectionHeader title="User register" subtitle="View all users and manage account operations." />

        {isLoading ? (
          <SectionLoader message="Loading users..." />
        ) : (
          <AppTable
            data={users}
            emptyMessage="No users available."
            columns={[
              {
                key: 'row_number',
                header: 'No.',
                render: (row) => {
                  const position = users.findIndex((user) => user.id === row.id)
                  return position >= 0 ? position + 1 : '-'
                },
              },
              { key: 'full_name', header: 'Full Name', render: (row) => row.full_name || '-' },
              { key: 'email', header: 'Email', render: (row) => row.email },
              { key: 'phone', header: 'Phone', render: (row) => row.phone || '-' },
              { key: 'role', header: 'Role', render: (row) => row.role },
              {
                key: 'is_active',
                header: 'Active',
                render: (row) => (
                  <span className={`status-chip ${row.is_active ? 'status-positive' : 'status-danger'}`}>
                    {row.is_active ? 'Active' : 'Inactive'}
                  </span>
                ),
              },
              {
                key: 'created_at',
                header: 'Created At',
                render: (row) => formatInUserTimezone(row.created_at),
              },
              {
                key: 'updated_at',
                header: 'Updated At',
                render: (row) => formatInUserTimezone(row.updated_at),
              },
              {
                key: 'actions',
                header: 'Action',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost p-2"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => openEditModal(row)}
                    >
                      <PencilLine className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-2 text-rose-200 hover:bg-rose-500/15"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      <Modal title="Edit user" isOpen={selectedUser !== null} onClose={closeEditModal}>
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
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={closeEditModal}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      <Modal title="Add user" isOpen={isAddModalOpen} onClose={closeAddModal}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>First Name *</span>
            <input
              value={addFormState.first_name}
              onChange={(event) => setAddFormState((current) => ({ ...current, first_name: event.target.value }))}
              className="input-field"
              type="text"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Last Name *</span>
            <input
              value={addFormState.last_name}
              onChange={(event) => setAddFormState((current) => ({ ...current, last_name: event.target.value }))}
              className="input-field"
              type="text"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200 sm:max-w-md">
            <span>Email *</span>
            <input
              value={addFormState.email}
              onChange={(event) => setAddFormState((current) => ({ ...current, email: event.target.value }))}
              className="input-field"
              type="email"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Phone</span>
            <input
              value={addFormState.phone}
              onChange={(event) => setAddFormState((current) => ({ ...current, phone: event.target.value }))}
              className="input-field"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>Role</span>
            <select
              value={addFormState.role}
              onChange={(event) =>
                setAddFormState((current) => ({ ...current, role: event.target.value === 'ADMIN' ? 'ADMIN' : 'SUPPORT' }))
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
              value={addFormState.password}
              onChange={(event) => setAddFormState((current) => ({ ...current, password: event.target.value }))}
              className="input-field"
              type="password"
              required
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={closeAddModal}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleAddUser} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add User'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        title="Delete user"
        description="This will permanently delete the selected user."
        isOpen={deleteTarget !== null}
        isLoading={isDeleting}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </section>
  )
}
