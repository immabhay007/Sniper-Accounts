import { useMemo, useState } from 'react'
import { AppTable } from '../components/AppTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { SectionHeader } from '../components/SectionHeader'
import { MetricCard } from '../components/MetricCard'
import { SectionLoader } from '../components/SectionLoader'
import { useAlerts } from '../components/alerts/useAlerts'
import { formatCurrency } from '../utils/format'

type ModulePageTemplateProps = {
  title: string
  subtitle: string
}

type ModuleRow = {
  item: string
  owner: string
  amount: number
  status: 'Healthy' | 'Review' | 'Action Needed'
}

const statusClassMap: Record<ModuleRow['status'], string> = {
  Healthy: 'status-chip status-positive',
  Review: 'status-chip status-neutral',
  'Action Needed': 'status-chip status-warning',
}

export const ModulePageTemplate = ({ title, subtitle }: ModulePageTemplateProps) => {
  const { pushAlert } = useAlerts()
  const [isModalOpen, setModalOpen] = useState(false)
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  const [isLoading, setLoading] = useState(false)

  const rows = useMemo<ModuleRow[]>(
    () => [
      { item: `${title} Pipeline A`, owner: 'Finance Team', amount: 48000, status: 'Healthy' },
      { item: `${title} Pipeline B`, owner: 'Operations', amount: 36500, status: 'Review' },
      { item: `${title} Pipeline C`, owner: 'Treasury', amount: 14950, status: 'Action Needed' },
    ],
    [title],
  )

  return (
    <section className="space-y-5">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(true)}>
              Open modal
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setLoading(true)
                window.setTimeout(() => setLoading(false), 1200)
              }}
            >
              Simulate load
            </button>
            <button type="button" className="btn-primary" onClick={() => setConfirmOpen(true)}>
              Trigger review
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Allocated" value={formatCurrency(124500)} note="Live budget" tone="neutral" />
        <MetricCard label="Settled" value={formatCurrency(96420)} note="On track" tone="positive" />
        <MetricCard label="Pending" value={formatCurrency(28080)} note="Needs attention" tone="warning" />
      </div>

      <section>
        <SectionHeader title={`${title} register`} subtitle="Use this table shell to bind future API data." />
        {isLoading ? (
          <SectionLoader message={`Loading ${title.toLowerCase()} records...`} />
        ) : (
          <AppTable
            data={rows}
            columns={[
              { key: 'item', header: 'Item', render: (row) => row.item },
              { key: 'owner', header: 'Owner', render: (row) => row.owner },
              { key: 'amount', header: 'Amount', render: (row) => formatCurrency(row.amount) },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <span className={statusClassMap[row.status]}>{row.status}</span>,
              },
            ]}
            emptyMessage={`No ${title.toLowerCase()} records available.`}
          />
        )}
      </section>

      <Modal title="Quick action" isOpen={isModalOpen} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-200">
            This reusable modal component is ready for create/edit forms across all modules.
          </p>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setModalOpen(false)}>
              Continue
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        title="Submit for review"
        description={`This action will queue ${title.toLowerCase()} items for back-office approval.`}
        isOpen={isConfirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          pushAlert('Review has been queued successfully.', 'success')
        }}
        confirmLabel="Submit"
      />
    </section>
  )
}
