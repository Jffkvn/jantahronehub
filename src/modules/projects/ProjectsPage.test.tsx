import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import ProjectsPage from './ProjectsPage'

vi.mock('./pages/ProjectsListPage', () => ({
  ProjectsListPage: () => <h1>Projects directory</h1>,
}))
vi.mock('./pages/CreateProjectPage', () => ({
  CreateProjectPage: () => <h1>Create project</h1>,
}))
vi.mock('./pages/ProjectWorkspacePage', () => ({
  ProjectWorkspacePage: ({ activeTab }: { activeTab: string }) => <h1>{({
    summary: 'Project summary',
    team: 'Project team',
    updates: 'Daily updates',
    cash: 'Project cash',
    inventory: 'Inventory & equipment',
    documents: 'Project documents',
    history: 'Project history',
  } as Record<string, string>)[activeTab]}</h1>,
}))

describe('ProjectsPage route tree', () => {
  it.each([
    ['/projects', 'Projects directory'],
    ['/projects/new', 'Create project'],
    ['/projects/11111111-1111-4111-8111-111111111111/summary', 'Project summary'],
    ['/projects/11111111-1111-4111-8111-111111111111/team', 'Project team'],
    ['/projects/11111111-1111-4111-8111-111111111111/updates', 'Daily updates'],
    ['/projects/11111111-1111-4111-8111-111111111111/cash', 'Project cash'],
    ['/projects/11111111-1111-4111-8111-111111111111/inventory', 'Inventory & equipment'],
    ['/projects/11111111-1111-4111-8111-111111111111/documents', 'Project documents'],
    ['/projects/11111111-1111-4111-8111-111111111111/history', 'Project history'],
  ])('resolves %s', (path, heading) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ProjectsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })
})
