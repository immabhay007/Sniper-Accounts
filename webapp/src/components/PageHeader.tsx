import { type ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  showEyebrow?: boolean
}

export const PageHeader = ({ title, subtitle, actions, showEyebrow = true }: PageHeaderProps) => {
  return (
    <header className="glass-card relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute -top-16 right-0 h-48 w-48 rounded-full bg-gradient-to-br from-blue-300/35 to-purple-300/35 blur-3xl" />
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          {showEyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Overview</p> : null}
          <h1 className="gradient-title mt-1 text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
