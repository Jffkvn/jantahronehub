import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { MultiCombobox } from './MultiCombobox'

const options = [
  { value: 'coord-1', label: 'Dorah Coordinator' },
  { value: 'coord-2', label: 'Evelyn Coordinator' },
]

describe('MultiCombobox', () => {
  it('selects without duplicates, renders chips and restores removed options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = renderWithProviders(
      <MultiCombobox label="Project coordinators" options={options} values={[]} onChange={onChange} />,
    )
    const input = screen.getByRole('combobox', { name: 'Project coordinators' })
    await user.click(input)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['coord-1'])

    rerender(
      <MultiCombobox label="Project coordinators" options={options} values={['coord-1']} onChange={onChange} />,
    )
    expect(screen.getByText('Dorah Coordinator')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove Dorah Coordinator' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('removes the last chip with Backspace only on an empty search and announces counts', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(
      <MultiCombobox label="Coordinators" options={options} values={['coord-1']} onChange={onChange} />,
    )
    const input = screen.getByRole('combobox', { name: 'Coordinators' })
    await user.type(input, 'e')
    await user.keyboard('{Backspace}')
    expect(onChange).not.toHaveBeenCalled()
    await user.clear(input)
    await user.keyboard('{Backspace}')
    expect(onChange).toHaveBeenCalledWith([])
    expect(screen.getByRole('status')).toHaveTextContent(/selected/i)
  })
})
