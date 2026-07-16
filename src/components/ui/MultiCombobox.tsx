import { ChevronDown, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

import type { ComboboxOption } from './Combobox'
import { FormError } from './FormError'

export interface MultiComboboxProps {
  label: string
  options: ComboboxOption[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
}

export function MultiCombobox({
  label,
  options,
  values,
  onChange,
  placeholder = 'Search and add',
  hint,
  error,
  disabled = false,
  required = false,
}: MultiComboboxProps) {
  const id = useId()
  const inputId = `multi-combobox-${id}`
  const listId = `${inputId}-listbox`
  const errorId = error ? `${inputId}-error` : undefined
  const hintId = hint ? `${inputId}-hint` : undefined
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

  const selected = values
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is ComboboxOption => Boolean(option))
  const available = useMemo(() => {
    const selectedValues = new Set(values)
    const term = query.trim().toLocaleLowerCase()
    return options.filter((option) =>
      !selectedValues.has(option.value)
      && (!term || option.label.toLocaleLowerCase().includes(term)),
    )
  }, [options, query, values])

  const normalizedActiveIndex = activeIndex >= 0 && activeIndex < available.length
    ? activeIndex
    : -1

  const add = (option: ComboboxOption) => {
    if (option.disabled || values.includes(option.value)) return
    onChange([...values, option.value])
    setQuery('')
    setActiveIndex(-1)
  }
  const remove = (value: string) => onChange(values.filter((selectedValue) => selectedValue !== value))

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !query && values.length) {
      event.preventDefault()
      remove(values[values.length - 1])
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => available.length ? (index + 1) % available.length : -1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => available.length ? (index <= 0 ? available.length - 1 : index - 1) : -1)
    } else if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(Math.max(available.length - 1, 0))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = available[normalizedActiveIndex]
      if (option) add(option)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const activeOption = open ? available[normalizedActiveIndex] : undefined

  return (
    <div className="oh-field" ref={rootRef}>
      <label className="oh-field__label" htmlFor={inputId}>
        {label}
        {required ? <span className="oh-field__required" aria-hidden="true"> *</span> : null}
      </label>
      <div className="oh-multi-combobox">
        {selected.length ? (
          <div className="oh-multi-combobox__chips">
            {selected.map((option) => (
              <span className="oh-multi-combobox__chip" key={option.value}>
                {option.label}
                <button
                  type="button"
                  aria-label={`Remove ${option.label}`}
                  disabled={disabled}
                  onClick={() => remove(option.value)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
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
            required={required && values.length === 0}
            placeholder={placeholder}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
              setActiveIndex(-1)
            }}
            onKeyDown={onKeyDown}
          />
          <ChevronDown className="oh-combobox__chevron" size={18} aria-hidden="true" />
          {open ? (
            <ul className="oh-combobox__list" id={listId} role="listbox" aria-multiselectable="true">
              {available.length ? available.map((option, index) => (
                <li
                  className="oh-combobox__option"
                  data-active={index === normalizedActiveIndex}
                  id={`${listId}-option-${option.value}`}
                  key={option.value}
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span>{option.label}</span>
                  {option.description ? <small>{option.description}</small> : null}
                </li>
              )) : <li className="oh-combobox__empty">No matching options</li>}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="oh-sr-only" role="status" aria-live="polite">
        {values.length} selected. {available.length} results available.
      </p>
      {hint ? <p className="oh-field__hint" id={hintId}>{hint}</p> : null}
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  )
}
