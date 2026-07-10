import type { HTMLAttributes, ReactNode } from 'react'

interface FormErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode
}

export function FormError({ children, className = '', ...props }: FormErrorProps) {
  return (
    <p className={`oh-form-error ${className}`.trim()} role="alert" {...props}>
      {children}
    </p>
  )
}
