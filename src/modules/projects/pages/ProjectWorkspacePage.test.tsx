import { screen } from '@testing-library/react'
import { vi, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { ProjectWorkspacePage } from './ProjectWorkspacePage'

vi.mock('../api/projects', () => ({
  projectsApi: {
    getProject: vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      project_code: 'PRJ-001',
      name: 'Kampala Fit Out',
      client_name: 'Client A',
      site_location: 'Kampala',
      status: 'active',
      health_status: 'on_track',
    }),
    getAssignments: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { permissionKeys: ['projects.read_all'], roleKeys: ['managing_director'] } }),
}))
vi.mock('./ProjectCashTab', () => ({
  ProjectCashTab: () => <article>Cash reconciliation</article>,
}))

describe('ProjectWorkspacePage', () => {
  it('shows stable project identity and every operational tab', async () => {
    renderWithProviders(<ProjectWorkspacePage projectId="11111111-1111-4111-8111-111111111111" activeTab="summary" />)
    expect(await screen.findByRole('heading', { name: 'Kampala Fit Out' })).toBeInTheDocument()
    for (const tab of ['Summary', 'Team', 'Daily Updates', 'Cash', 'Inventory & Equipment', 'Documents', 'History']) {
      expect(screen.getByRole('link', { name: tab })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: 'Project summary' })).toBeInTheDocument()
  })
})
