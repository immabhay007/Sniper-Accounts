import { type ReactNode } from 'react'
import { GlassModal } from './GlassModal'

type ModalProps = {
  title: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

export const Modal = ({ title, isOpen, onClose, children, size }: ModalProps) => {
  return (
    <GlassModal title={title} isOpen={isOpen} onClose={onClose} size={size}>
      {children}
    </GlassModal>
  )
}
