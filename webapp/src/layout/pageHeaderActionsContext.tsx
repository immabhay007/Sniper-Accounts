import { createContext, useContext, type ReactNode } from 'react'

type PageHeaderActionsContextValue = {
  actions: ReactNode | null
  setActions: (actions: ReactNode | null) => void
  title: string | null
  setTitle: (title: string | null) => void
}

const PageHeaderActionsContext = createContext<PageHeaderActionsContextValue | null>(null)

export const PageHeaderActionsProvider = PageHeaderActionsContext.Provider

export const usePageHeaderActions = (): PageHeaderActionsContextValue => {
  const context = useContext(PageHeaderActionsContext)

  if (!context) {
    throw new Error('usePageHeaderActions must be used within PageHeaderActionsProvider')
  }

  return context
}
