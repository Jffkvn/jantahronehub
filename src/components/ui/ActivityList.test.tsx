import { screen } from '@testing-library/react'
import { FileText } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { ActivityList } from './ActivityList'

describe('ActivityList', () => {
  it('shows an intentional empty state', () => {
    renderWithProviders(<ActivityList items={[]} emptyMessage="No recent activity." />)

    expect(screen.getByText('No recent activity.')).toBeVisible()
  })

  it('renders linked activity with detail and time context', () => {
    renderWithProviders(
      <ActivityList
        items={[
          {
            id: 'activity-1',
            title: 'Leave request approved',
            detail: 'Olivia Pope · Annual leave',
            timestamp: '4h ago',
            icon: <FileText aria-hidden="true" />,
            to: '/hr/leave',
          },
        ]}
      />,
    )

    expect(screen.getByRole('link', { name: /leave request approved olivia pope annual leave 4h ago/i })).toHaveAttribute('href', '/hr/leave')
  })
})
