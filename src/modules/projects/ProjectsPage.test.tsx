import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import ProjectsPage from './ProjectsPage'

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
