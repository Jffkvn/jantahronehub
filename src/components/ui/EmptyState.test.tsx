import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('provides a heading, guidance, and optional next action', () => {
    renderWithProviders(
      <EmptyState
        title="No stock requests"
        description="New project requests will appear here."
        action={<Button>Create request</Button>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'No stock requests' })).toBeVisible()
    expect(screen.getByText('New project requests will appear here.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create request' })).toBeVisible()
  })
})
