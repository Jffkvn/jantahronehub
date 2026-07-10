import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { Input } from './Input'

describe('Input', () => {
  it('connects its label, hint, and error to the control', () => {
    renderWithProviders(
      <Input
        label="Company email"
        hint="Use the employee's work address"
        error="A company email is required"
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Company email' })
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription(
      "Use the employee's work address A company email is required",
    )
  })
})
