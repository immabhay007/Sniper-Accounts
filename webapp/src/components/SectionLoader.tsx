export const SectionLoader = ({ message = 'Loading section...' }: { message?: string }) => {
  return (
    <div className="glass-section space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="skeleton h-5 w-44" />
        <div className="skeleton h-5 w-20" />
      </div>
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-[94%]" />
      <div className="skeleton h-10 w-[88%]" />
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  )
}
