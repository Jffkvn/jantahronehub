import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { ProjectDocumentsTab } from './ProjectDocumentsTab'

vi.mock('../../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { permissionKeys: [], roleKeys: ['coordinator'] } }),
}))

describe('ProjectDocumentsTab', () => {
  it('shows a structured empty state instead of a plain text card', async () => {
    renderWithProviders(<ProjectDocumentsTab projectId="project-1" />)
    expect(await screen.findByRole('heading', { name: 'No project documents yet' })).toBeInTheDocument()
    expect(screen.getByText(/contracts, site evidence, and completion records/i)).toBeInTheDocument()
  })
})
