import { X } from 'lucide-react'
import { type ReactNode } from 'react'

type GlassModalProps = {
  title: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

const sizeClassMap = {
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
}

export const GlassModal = ({
  title,
  isOpen,
  onClose,
  children,
  footer,
  size = 'lg',
}: GlassModalProps) => {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
      <div className={`glass-card flex max-h-[85vh] w-full flex-col overflow-hidden ${sizeClassMap[size]}`}>
        <div className="flex items-center justify-between border-b border-white/70 bg-gradient-to-r from-blue-600/90 to-purple-600/90 px-6 py-4 text-white">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/35 p-1.5 text-white transition hover:bg-white/15"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="glass-modal-content overflow-y-auto px-6 py-5 text-slate-900">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 border-t border-white/70 bg-white/80 px-6 py-4 backdrop-blur">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
