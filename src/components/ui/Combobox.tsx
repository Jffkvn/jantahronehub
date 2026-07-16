import { ChevronDown } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

import { FormError } from './FormError'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface ComboboxProps {
  label: string
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
  emptyMessage?: string
}

export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search and select',
  hint,
  error,
  disabled = false,
  required = false,
  emptyMessage = 'No matching options',
}: ComboboxProps) {
  const id = useId()
  const inputId = `combobox-${id}`
  const listId = `${inputId}-listbox`
  const errorId = error ? `${inputId}-error` : undefined
  const hintId = hint ? `${inputId}-hint` : undefined
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

  const filtered = useMemo(() => {
    const term = open ? query.trim().toLocaleLowerCase() : ''
    return options.filter((option) =>
      !term || option.label.toLocaleLowerCase().includes(term),
    )
  }, [open, options, query])

  const normalizedActiveIndex = activeIndex >= 0 && activeIndex < filtered.length
    ? activeIndex
    : -1

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return
    onChange(option.value)
    setQuery(option.label)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => filtered.length ? (index + 1) % filtered.length : -1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => filtered.length ? (index <= 0 ? filtered.length - 1 : index - 1) : -1)
    } else if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(Math.max(filtered.length - 1, 0))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = filtered[normalizedActiveIndex]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setQuery(selected?.label ?? '')
    }
  }

  const activeOption = open ? filtered[normalizedActiveIndex] : undefined

  return (
    <div className="oh-field" ref={rootRef}>
      <label className="oh-field__label" htmlFor={inputId}>
        {label}
        {required ? <span className="oh-field__required" aria-hidden="true"> *</span> : null}
      </label>
      <div className="oh-combobox">
        <input
          id={inputId}
          className="oh-input oh-combobox__input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            activeOption ? `${listId}-option-${activeOption.value}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={open ? query : selected?.label ?? ''}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
            if (!event.target.value && value) onChange(null)
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown className="oh-combobox__chevron" size={18} aria-hidden="true" />
        {open ? (
          <ul className="oh-combobox__list" id={listId} role="listbox">
            {filtered.length ? filtered.map((option, index) => (
              <li
                className="oh-combobox__option"
                data-active={index === normalizedActiveIndex}
                data-selected={option.value === value}
                id={`${listId}-option-${option.value}`}
                key={option.value}
                role="option"
                aria-disabled={option.disabled || undefined}
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{option.label}</span>
                {option.description ? <small>{option.description}</small> : null}
              </li>
            )) : <li className="oh-combobox__empty">{emptyMessage}</li>}
          </ul>
        ) : null}
      </div>
      {hint ? <p className="oh-field__hint" id={hintId}>{hint}</p> : null}
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  )
}
