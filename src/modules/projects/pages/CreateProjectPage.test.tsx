import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { CreateProjectPage } from './CreateProjectPage'

const { create } = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
}))
vi.mock('../api/projects', () => ({
  projectsApi: {
    create,
    listCandidates: vi.fn().mockResolvedValue([
      { profileId: '22222222-2222-4222-8222-222222222222', displayName: 'PM One', roleKeys: ['project_manager'] },
      { profileId: '33333333-3333-4333-8333-333333333333', displayName: 'Coordinator One', roleKeys: ['coordinator'] },
    ]),
  },
}))
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    access: {
      profile: { id: '44444444-4444-4444-8444-444444444444' },
      roleKeys: ['cfo'],
      permissionKeys: ['projects.create', 'projects.assign_all'],
    },
  }),
}))

describe('CreateProjectPage', () => {
  it('uses a dedicated page with project, schedule, team and control sections', async () => {
    renderWithProviders(<CreateProjectPage />)
    expect(screen.getByRole('heading', { name: 'Create project' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project identity' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Schedule and controls' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project team' })).toBeInTheDocument()
    expect(screen.getByText('Define the client-facing reference and site.')).toBeInTheDocument()
    expect(screen.getByText('Set the working dates, initial condition, and budget controls.')).toBeInTheDocument()
    expect(screen.getByText('Appoint accountable delivery roles and retain the reason.')).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Primary project manager' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Project coordinators' })).toBeInTheDocument()
  })

  it('preserves entered values when validation blocks submission', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateProjectPage />)
    const name = screen.getByRole('textbox', { name: /project name/i })
    await user.type(name, 'Kampala Site')
    await user.click(screen.getByRole('button', { name: /create project/i }))
    expect(name).toHaveValue('Kampala Site')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
