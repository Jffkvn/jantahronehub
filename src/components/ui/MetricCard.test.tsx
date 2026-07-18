import { screen } from '@testing-library/react'
import { Users } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { MetricCard } from './MetricCard'

describe('MetricCard', () => {
  it('presents a labelled metric with its context', () => {
    renderWithProviders(
      <MetricCard
        label="Active employees"
        value="248"
        detail="12 joined this month"
        icon={<Users aria-hidden="true" />}
      />,
    )

    expect(screen.getByText('Active employees')).toBeVisible()
    expect(screen.getByText('248')).toBeVisible()
    expect(screen.getByText('12 joined this month')).toBeVisible()
  })

  it('becomes one clear link when it has a destination', () => {
    renderWithProviders(
      <MetricCard label="Pending approvals" value={3} to="/hr/leave" />,
    )

    expect(screen.getByRole('link', { name: /pending approvals 3/i })).toHaveAttribute(
      'href',
      '/hr/leave',
    )
  })
})
