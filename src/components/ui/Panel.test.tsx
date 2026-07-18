import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { Panel } from './Panel'

describe('Panel', () => {
  it('groups content beneath a semantic title and description', () => {
    renderWithProviders(
      <Panel title="Recent activity" description="Latest operational changes">
        <p>Project created</p>
      </Panel>,
    )

    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
    expect(screen.getByText('Latest operational changes')).toBeVisible()
    expect(screen.getByText('Project created')).toBeVisible()
  })

  it('supports a labelled action without absorbing the panel content', () => {
    renderWithProviders(
      <Panel title="Training" action={<a href="/hr/training">View all</a>}>
        <p>Two expiring certificates</p>
      </Panel>,
    )

    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/hr/training',
    )
  })
})
