import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

export type GlassColumn<TItem> = {
  key: keyof TItem | string
  header: string
  render: (item: TItem, index: number) => ReactNode
  className?: string
}

type GlassDataTableProps<TItem> = {
  data: TItem[]
  columns: GlassColumn<TItem>[]
  emptyMessage?: string
  pageSize?: number
  rowKey?: (item: TItem, index: number) => string | number
}

export const GlassDataTable = <TItem,>({
  data,
  columns,
  emptyMessage = 'No records available.',
  pageSize = 8,
  rowKey,
}: GlassDataTableProps<TItem>) => {
  const [page, setPage] = useState(1)

  const totalPages = useMemo(() => {
    if (!data.length) return 1
    return Math.ceil(data.length / pageSize)
  }, [data.length, pageSize])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize])

  if (!data.length) {
    return (
      <div className="table-shell p-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead>
            <tr className="bg-gradient-to-r from-blue-100/80 via-indigo-100/70 to-purple-100/80">
              {columns.map((column) => (
                <th key={String(column.key)} className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedData.map((item, index) => {
              const absoluteIndex = (page - 1) * pageSize + index
              return (
                <tr
                  key={rowKey ? rowKey(item, absoluteIndex) : absoluteIndex}
                  className="border-t border-white/60 transition hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-purple-50/80"
                >
                  {columns.map((column) => (
                    <td key={`${String(column.key)}-${absoluteIndex}`} className={`px-4 py-3 align-top ${column.className ?? ''}`}>
                      {column.render(item, absoluteIndex)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-white/70 bg-white/70 px-4 py-3 text-xs text-slate-600">
        <p>
          Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.length)} of {data.length}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-outline !px-2 !py-1"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <span className="rounded-md bg-white/80 px-2 py-1 text-slate-700">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            className="btn btn-outline !px-2 !py-1"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
