import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/render'
import { projectOperationsApi } from '../api/projectOperations'
import { ProjectHistoryTab } from './ProjectHistoryTab'

vi.mock('../api/projectOperations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/projectOperations')>()
  return { ...actual, projectOperationsApi: { ...actual.projectOperationsApi, history: vi.fn() } }
})

describe('ProjectHistoryTab', () => {
  it('renders a chronological, non-sensitive audit trail', async () => {
    vi.mocked(projectOperationsApi.history).mockResolvedValue([{ eventType: 'project.created', occurredAt: '2026-07-16T00:00:00Z', actorName: 'CFO', reason: 'New contract' }])
    renderWithProviders(<ProjectHistoryTab projectId="11111111-1111-4111-8111-111111111111" />)
    expect(await screen.findByText('Project created')).toBeInTheDocument()
    expect(screen.getByText('New contract')).toBeInTheDocument()
  })

  it('shows a purposeful empty state when no events exist', async () => {
    vi.mocked(projectOperationsApi.history).mockResolvedValue([])
    renderWithProviders(<ProjectHistoryTab projectId="11111111-1111-4111-8111-111111111111" />)
    expect(await screen.findByRole('heading', { name: 'No project activity yet' })).toBeInTheDocument()
  })
})
