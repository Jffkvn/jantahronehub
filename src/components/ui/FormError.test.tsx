import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { FormError } from './FormError'

describe('FormError', () => {
  it('announces validation feedback', () => {
    renderWithProviders(
      <FormError id="employee-number-error">
        Employee number already exists.
      </FormError>,
    )

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'employee-number-error')
  })
})
