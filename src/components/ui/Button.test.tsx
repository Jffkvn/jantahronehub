import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { Button } from './Button'

describe('Button', () => {
  it('runs its action from the keyboard', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Button onClick={onClick}>Save employee</Button>)

    await user.tab()
    await user.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('announces loading and prevents repeat actions', () => {
    renderWithProviders(<Button loading>Save employee</Button>)

    expect(screen.getByRole('button', { name: 'Save employee' })).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})
