import { screen } from '@testing-library/react'
import { vi, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { ProjectUpdatesTab } from './ProjectUpdatesTab'

vi.mock('../api/projects', () => ({
  projectsApi: {
    getAssignments: vi.fn().mockResolvedValue([
      { id: 'a1', user_id: 'coord1', role_on_project: 'coordinator', unassigned_at: null },
    ]),
    getDailyUpdates: vi.fn().mockResolvedValue([
      { id: 'u1', project_id: 'p1', submitted_by: 'coord1', update_date: '2026-07-16', summary: 'Site mobilisation complete', photo_urls: [], status: 'submitted', pm_feedback: null, profiles_submitted_by: { display_name: 'Cathy Coordinator' } },
    ]),
    saveDailyUpdate: vi.fn(),
    reviewDailyUpdate: vi.fn(),
  },
}))
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { profile: { id: 'coord1' }, permissionKeys: ['daily_updates.create'], roleKeys: ['coordinator'] } }),
}))

describe('ProjectUpdatesTab', () => {
  it('lets an actively assigned coordinator draft or submit and shows recent evidence', async () => {
    renderWithProviders(<ProjectUpdatesTab projectId="p1" />)
    expect(await screen.findByText('Site mobilisation complete')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit update' })).toBeInTheDocument()
    expect(screen.getByText('Cathy Coordinator')).toBeInTheDocument()
  })
})
