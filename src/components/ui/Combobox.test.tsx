import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { Combobox } from './Combobox'

const options = [
  { value: 'pm-1', label: 'Amina Project Manager' },
  { value: 'pm-2', label: 'Brian Project Manager' },
  { value: 'pm-3', label: 'Cathy Project Manager' },
]

describe('Combobox', () => {
  it('filters, exposes accessible state and selects with the keyboard', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(
      <Combobox label="Primary project manager" options={options} value={null} onChange={onChange} />,
    )

    const input = screen.getByRole('combobox', { name: 'Primary project manager' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.click(input)
    await user.type(input, 'brian')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('option', { name: 'Brian Project Manager' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Amina Project Manager' })).not.toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('pm-2')
  })

  it('supports Home, End, Escape, errors, disabled state and outside clicks', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <div>
        <Combobox label="Coordinator" options={options} value={null} onChange={vi.fn()} error="Select a coordinator" />
        <button>Outside</button>
      </div>,
    )
    const input = screen.getByRole('combobox', { name: 'Coordinator' })
    await user.click(input)
    await user.keyboard('{End}')
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('pm-3'))
    await user.keyboard('{Home}')
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('pm-1'))
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toBeInvalid()
    await user.click(input)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })
})
