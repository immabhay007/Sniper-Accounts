import { Modal } from './Modal'

type ConfirmDialogProps = {
  title: string
  description: string
  isOpen: boolean
  isLoading?: boolean
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({
  title,
  description,
  isOpen,
  isLoading = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  return (
    <Modal title={title} isOpen={isOpen} onClose={onCancel}>
      <div className="space-y-6">
        <p className="text-sm text-slate-200">{description}</p>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost" disabled={isLoading}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
