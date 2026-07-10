import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('exposes status text without relying on colour', () => {
    renderWithProviders(<StatusBadge tone="warning">Pending CFO review</StatusBadge>)

    expect(screen.getByText('Pending CFO review')).toHaveAttribute(
      'data-tone',
      'warning',
    )
  })
})
