import { type ReactNode } from 'react'
import { GlassDataTable } from './GlassDataTable'

type Column<TItem> = {
  key: keyof TItem | string
  header: string
  render: (item: TItem) => ReactNode
}

type AppTableProps<TItem> = {
  data: TItem[]
  columns: Column<TItem>[]
  emptyMessage?: string
}

export const AppTable = <TItem,>({
  data,
  columns,
  emptyMessage = 'No records available yet.',
}: AppTableProps<TItem>) => {
  return (
    <GlassDataTable
      data={data}
      emptyMessage={emptyMessage}
      columns={columns.map((column) => ({
        key: column.key,
        header: column.header,
        render: (item: TItem) => column.render(item),
      }))}
    />
  )
}
