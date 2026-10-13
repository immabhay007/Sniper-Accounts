import { type ReactNode } from 'react'

type SectionHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export const SectionHeader = ({ title, subtitle, actions }: SectionHeaderProps) => {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="gradient-title text-lg font-extrabold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
