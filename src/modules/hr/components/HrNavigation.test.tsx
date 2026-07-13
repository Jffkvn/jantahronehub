import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { HrNavigation } from './HrNavigation'

describe('HrNavigation', () => {
  it('shows only destinations allowed by the current permissions', () => {
    render(
      <MemoryRouter initialEntries={['/hr/payroll']}>
        <HrNavigation permissions={['payroll.read']} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Payroll' })).toHaveAttribute('href', '/hr/payroll')
    expect(screen.getByRole('link', { name: 'Payroll' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Employees' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Historical migration' })).not.toBeInTheDocument()
  })

  it('provides stable employee, payroll and migration destinations when permitted', () => {
    render(
      <MemoryRouter initialEntries={['/hr/employees/employee-1']}>
        <HrNavigation
          permissions={['employees.read', 'payroll.read', 'payroll.migrate_history']}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('navigation', { name: 'Human resources' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Employees' })).toHaveAttribute('href', '/hr/employees')
    expect(screen.getByRole('link', { name: 'Employees' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Payroll' })).toHaveAttribute('href', '/hr/payroll')
    expect(screen.getByRole('link', { name: 'Historical migration' })).toHaveAttribute(
      'href',
      '/hr/payroll/history-migration',
    )
  })
})
