import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { AppShell } from './AppShell'

function renderShell(
  role: 'employee' | 'hr_admin' | 'warehouse_manager' | 'super_admin',
  enabledModules: string[],
) {
  return renderWithProviders(
    <Routes>
      <Route
        element={
          <AppShell
            currentUser={{
              name: 'Dora K.',
              email: 'dora@egyprouganda.com',
              role,
            }}
            enabledModules={enabledModules}
          />
        }
      >
        <Route index element={<p>Dashboard content</p>} />
      </Route>
    </Routes>,
  )
}

describe('AppShell', () => {
  it('omits disabled modules from every navigation surface', () => {
    renderShell('super_admin', ['home', 'my_workspace', 'hr'])

    expect(screen.getAllByRole('link', { name: /home/i })).not.toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /my workspace/i })).not.toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /hr management/i })).not.toHaveLength(0)
    expect(screen.queryByRole('link', { name: /inventory/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /project cash/i })).not.toBeInTheDocument()
  })

  it('hides enabled modules that the current role cannot access', () => {
    renderShell('employee', [
      'home',
      'my_workspace',
      'hr',
      'inventory',
      'cash',
      'admin',
    ])

    expect(screen.getAllByRole('link', { name: /home/i })).not.toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /my workspace/i })).not.toHaveLength(0)
    expect(screen.queryByRole('link', { name: /hr management/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /system administration/i })).not.toBeInTheDocument()
  })

  it('accepts effective module access from the future permission provider', () => {
    renderWithProviders(
      <Routes>
        <Route
          element={
            <AppShell
              currentUser={{
                name: 'Alex K.',
                email: 'alex@egyprouganda.com',
                role: 'employee'
              }}
              enabledModules={['home', 'hr', 'admin']}
              accessibleModules={['home', 'hr']}
            />
          }
        >
          <Route index element={<p>Dashboard content</p>} />
        </Route>
      </Routes>,
    )

    expect(screen.getAllByRole('link', { name: /hr management/i })).not.toHaveLength(0)
    expect(screen.queryByRole('link', { name: /system administration/i })).not.toBeInTheDocument()
  })

  it('shows the product, provider, current role, and routed content', () => {
    renderShell('hr_admin', ['home', 'my_workspace', 'hr'])

    expect(screen.getByText('Egypro OneHub')).toBeInTheDocument()
    expect(screen.getByText('Powered by JantaHR')).toBeInTheDocument()
    expect(screen.getByText('HR Administrator')).toBeInTheDocument()
    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation accessibly', async () => {
    const user = userEvent.setup()
    renderShell('hr_admin', ['home', 'my_workspace', 'hr'])

    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(openButton)
    expect(openButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Main navigation' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(screen.queryByRole('dialog', { name: 'Main navigation' })).not.toBeInTheDocument()
  })
})
