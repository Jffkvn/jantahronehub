import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  loading?: boolean
  variant?: ButtonVariant
  iconOnly?: boolean
}

export function Button({
  children,
  className = '',
  disabled,
  loading = false,
  variant = 'primary',
  iconOnly = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'oh-button',
    `oh-button--${variant}`,
    iconOnly ? 'oh-button--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={type}
      {...props}
    >
      {loading ? <span className="oh-button__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
