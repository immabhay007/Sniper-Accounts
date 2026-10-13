type MetricCardProps = {
  label: string
  value: string
  note: string
  tone?: 'positive' | 'neutral' | 'warning' | 'danger'
}

const toneMap = {
  positive: 'status-success',
  neutral: 'status-neutral',
  warning: 'status-warning',
  danger: 'status-danger',
}

export const MetricCard = ({ label, value, note, tone = 'neutral' }: MetricCardProps) => {
  return (
    <article className="glass-section p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
      <span className={`status-chip mt-3 inline-flex ${toneMap[tone]}`}>{note}</span>
    </article>
  )
}
