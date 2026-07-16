import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { ProjectTeamTab } from './ProjectTeamTab'

const { assign, unassign } = vi.hoisted(() => ({ assign: vi.fn(), unassign: vi.fn() }))
vi.mock('../api/projects', () => ({
  projectsApi: {
    getAssignments: vi.fn().mockResolvedValue([
      { id: 'a1', project_id: 'p1', user_id: 'pm1', role_on_project: 'pm', assigned_at: '2026-07-01', unassigned_at: null, profiles: { display_name: 'Pat PM' } },
      { id: 'a2', project_id: 'p1', user_id: 'c1', role_on_project: 'coordinator', assigned_at: '2026-07-02', unassigned_at: null, profiles: { display_name: 'Cathy Coordinator' } },
    ]),
    getAssignmentHistory: vi.fn().mockResolvedValue([]),
    listCandidates: vi.fn().mockResolvedValue([
      { profileId: 'pm2', displayName: 'Paul PM', roleKeys: ['project_manager'] },
      { profileId: 'c2', displayName: 'Chris Coordinator', roleKeys: ['coordinator'] },
    ]),
    assign,
    unassign,
  },
}))
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { profile: { id: 'cfo1' }, permissionKeys: ['projects.assign_all'], roleKeys: ['cfo'] } }),
}))

describe('ProjectTeamTab', () => {
  it('separates the primary PM and coordinators and exposes CFO controls', async () => {
    renderWithProviders(<ProjectTeamTab projectId="p1" />)
    expect(screen.getByRole('heading', { name: 'Primary project manager' })).toBeInTheDocument()
    expect(await screen.findByText('Pat PM')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coordinators' })).toBeInTheDocument()
    expect(screen.getByText('Cathy Coordinator')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /appoint or replace pm/i })).toBeInTheDocument()
  })

  it('requires a reason before opening an assignment action', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProjectTeamTab projectId="p1" />)
    await screen.findByText('Pat PM')
    await user.click(screen.getByRole('button', { name: /add coordinator/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/reason/i)
    expect(assign).not.toHaveBeenCalled()
  })
})
