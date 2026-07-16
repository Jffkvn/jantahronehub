import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { AccessContext } from '../modules/auth/AuthGateway'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { accessContext, fakeGateway } from '../modules/auth/test/fakes'
import { AppRouter } from './router'

vi.mock('../modules/admin/AdminPage', () => ({
  default: () => <h1>User administration workspace</h1>,
}))
vi.mock('../modules/projects/ProjectsPage', () => ({
  default: () => <h1>Standalone Projects workspace</h1>,
}))

function renderRouter(path: string, access: AccessContext) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider gateway={fakeGateway({ access })}>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppRouter', () => {
  it('loads the development shell showcase without bypassing authentication', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/components/shell']}>
          <AppRouter />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: /your onehub workspace/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Primary navigation')).toBeInTheDocument()
  })

  it('allows HR with users.read to open System Administration', async () => {
    renderRouter(
      '/admin',
      accessContext({
        roleKeys: ['hr_admin'],
        permissionKeys: ['users.read'],
        enabledModules: ['home', 'admin'],
      }),
    )

    expect(
      await screen.findByRole('heading', { name: /user administration workspace/i }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: /system administration/i }),
    ).not.toHaveLength(0)
  })

  it('denies a manually entered admin route without users.read', async () => {
    renderRouter(
      '/admin',
      accessContext({
        roleKeys: ['employee'],
        permissionKeys: [],
        enabledModules: ['home', 'admin'],
      }),
    )

    expect(
      await screen.findByRole('heading', { name: /we could not open this workspace/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /user administration workspace/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /system administration/i }),
    ).not.toBeInTheDocument()
  })

  it('retains super-admin access to System Administration', async () => {
    renderRouter(
      '/admin',
      accessContext({
        roleKeys: ['super_admin'],
        permissionKeys: ['users.read', 'users.manage'],
        enabledModules: ['home', 'admin'],
      }),
    )

    expect(
      await screen.findByRole('heading', { name: /user administration workspace/i }),
    ).toBeInTheDocument()
  })

  it.each([
    ['cfo', ['projects.read_all']],
    ['project_manager', ['projects.read']],
    ['coordinator', ['projects.read']],
    ['managing_director', ['projects.read_all']],
    ['warehouse_manager', ['projects.read_operational']],
    ['super_admin', ['projects.manage']],
  ] as const)('allows %s to open the appropriate Projects workspace', async (role, permissionKeys) => {
    renderRouter('/projects', accessContext({
      roleKeys: [role],
      permissionKeys: [...permissionKeys],
      enabledModules: ['home', 'projects'],
    }))

    expect(await screen.findByRole('heading', { name: 'Standalone Projects workspace' })).toBeInTheDocument()
  })

  it('denies a manually entered Projects route to an unrelated role', async () => {
    renderRouter('/projects', accessContext({
      roleKeys: ['hr_admin'],
      permissionKeys: ['employees.read'],
      enabledModules: ['home', 'projects'],
    }))

    expect(await screen.findByRole('heading', { name: /we could not open this workspace/i })).toBeInTheDocument()
  })
})
