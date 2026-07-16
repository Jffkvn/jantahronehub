import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { inventoryApi } from '../api/inventory'
import { projectsApi } from '../../projects/api/projects'
import { RequestsPage } from './RequestsPage'

vi.mock('../api/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/inventory')>()
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listRequests: vi.fn(),
      listConsumables: vi.fn(),
      listEquipment: vi.fn(),
      requestStock: vi.fn(),
    },
  }
})

vi.mock('../../projects/api/projects', () => ({
  projectsApi: { getProjects: vi.fn() },
}))

describe('RequestsPage canonical project selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.listRequests).mockResolvedValue([])
    vi.mocked(inventoryApi.listConsumables).mockResolvedValue([])
    vi.mocked(inventoryApi.listEquipment).mockResolvedValue([])
    vi.mocked(projectsApi.getProjects).mockResolvedValue([{
      id: '33333333-3333-4333-8333-333333333333',
      project_code: 'PRJ-001',
      name: 'Kampala Tower',
      site_location: 'Kampala',
      status: 'active',
      estimated_budget_ugx: null,
      budget_notes: null,
      health_status: 'on_track',
      budget_set_by: null,
      created_by: '44444444-4444-4444-8444-444444444444',
      created_at: '2026-07-16T00:00:00Z',
      updated_at: '2026-07-16T00:00:00Z',
    }])
  })

  it('uses the searchable project picker instead of free text', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RequestsPage />)
    await user.click(screen.getByRole('button', { name: /create stock request/i }))

    const projectPicker = await screen.findByRole('combobox', { name: 'Project' })
    await user.click(projectPicker)
    expect(await screen.findByRole('option', { name: /PRJ-001.*Kampala Tower/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /project.*site name/i })).not.toBeInTheDocument()
  })
})
