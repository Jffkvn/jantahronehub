import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { ProjectsListPage } from './ProjectsListPage'

const { getProjects } = vi.hoisted(() => ({ getProjects: vi.fn() }))
vi.mock('../api/projects', () => ({
  projectsApi: { getProjects },
}))
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { permissionKeys: ['projects.create'] } }),
}))

describe('ProjectsListPage', () => {
  beforeEach(() => {
    getProjects.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        project_code: 'PRJ-001',
        name: 'Kampala Fit Out',
        client_name: 'Client A',
        site_location: 'Kampala',
        status: 'active',
        health_status: 'at_risk',
        planned_start_date: '2026-08-01',
        expected_end_date: '2026-12-31',
        estimated_budget_ugx: null,
        budget_notes: null,
        budget_set_by: null,
        created_by: '22222222-2222-4222-8222-222222222222',
        created_at: '2026-07-16T10:00:00Z',
        updated_at: '2026-07-16T10:00:00Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        project_code: 'PRJ-002',
        name: 'Entebbe Warehouse',
        client_name: 'Client B',
        site_location: 'Entebbe',
        status: 'on_hold',
        health_status: 'needs_attention',
        estimated_budget_ugx: null,
        budget_notes: null,
        budget_set_by: null,
        created_by: '22222222-2222-4222-8222-222222222222',
        created_at: '2026-07-16T10:00:00Z',
        updated_at: '2026-07-16T10:00:00Z',
      },
    ])
  })

  it('shows project metrics, canonical links, and creation authority', async () => {
    renderWithProviders(<ProjectsListPage />)
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(await screen.findByText('Kampala Fit Out')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create project/i })).toHaveAttribute('href', '/projects/new')
    expect(screen.getByRole('link', { name: 'Kampala Fit Out' })).toHaveAttribute(
      'href',
      '/projects/11111111-1111-4111-8111-111111111111/summary',
    )
    expect(screen.getAllByText('At risk')).not.toHaveLength(0)
  })

  it('filters projects by search and status', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProjectsListPage />)
    await screen.findByText('Kampala Fit Out')
    await user.type(screen.getByRole('searchbox', { name: /search projects/i }), 'Entebbe')
    expect(screen.queryByText('Kampala Fit Out')).not.toBeInTheDocument()
    expect(screen.getByText('Entebbe Warehouse')).toBeInTheDocument()
  })
})
