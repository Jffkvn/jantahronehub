import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from '../auth/AuthProvider'
import { accessContext, fakeGateway } from '../auth/test/fakes'
import HrPage from './HrPage'
import { defaultHrPath } from './navigation'

describe('HrPage navigation helpers', () => {
  it('routes CFO payroll readers directly to payroll', () => {
    expect(defaultHrPath(['payroll.read'])).toBe('payroll')
  })

  it('routes HR employee readers to the employee directory', () => {
    expect(defaultHrPath(['employees.read', 'payroll.read'])).toBe('employees')
  })
})

describe('HrPage Routing', () => {
  it('denies HR Setup when the setup-management permission is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/hr/setup']}>
        <AuthProvider
          gateway={fakeGateway({
            access: accessContext({
              permissionKeys: ['employees.read'],
              roleKeys: ['employee'],
            }),
          })}
        >
          <Routes>
            <Route path="/forbidden" element={<p>Permission denied</p>} />
            <Route path="/hr/*" element={<HrPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Permission denied')).toBeInTheDocument()
  })

  it('denies access to historical payroll migration if permission is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/hr/payroll/history-migration']}>
        <AuthProvider
          gateway={fakeGateway({
            access: accessContext({
              permissionKeys: ['employees.read'],
              roleKeys: ['hr_admin'],
            }),
          })}
        >
          <Routes>
            <Route path="/forbidden" element={<p>Permission denied</p>} />
            <Route path="/hr/*" element={<HrPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Permission denied')).toBeInTheDocument()
  })

  it('allows access to historical payroll migration if permission is present', async () => {
    render(
      <MemoryRouter initialEntries={['/hr/payroll/history-migration']}>
        <AuthProvider
          gateway={fakeGateway({
            access: accessContext({
              permissionKeys: ['payroll.migrate_history'],
              roleKeys: ['super_admin'],
            }),
          })}
        >
          <Routes>
            <Route path="/forbidden" element={<p>Permission denied</p>} />
            <Route path="/hr/*" element={<HrPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole(
        'heading',
        { name: /Historical payroll migration/i },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument()
  })
})
