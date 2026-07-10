import { useId, type InputHTMLAttributes } from 'react'

import { FormError } from './FormError'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export function Input({
  label,
  hint,
  error,
  id,
  className = '',
  required,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? `input-${generatedId}`
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="oh-field">
      <label className="oh-field__label" htmlFor={inputId}>
        {label}
        {required ? (
          <span className="oh-field__required" aria-hidden="true">
            {' '}*
          </span>
        ) : null}
      </label>
      <input
        id={inputId}
        className={`oh-input ${className}`.trim()}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint ? (
        <p className="oh-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  )
}
