import type { HTMLAttributes, ReactNode } from 'react'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  tone?: StatusTone
}

export function StatusBadge({
  children,
  tone = 'neutral',
  className = '',
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`oh-badge ${className}`.trim()}
      data-tone={tone}
      {...props}
    >
      {children}
    </span>
  )
}
