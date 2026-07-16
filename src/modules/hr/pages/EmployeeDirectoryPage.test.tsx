import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { EmployeeApi } from '../api/employees'
import { EmployeeDirectoryPage } from './EmployeeDirectoryPage'

const employee = {
  id: 'employee-1',
  employeeNumber: 'EGY-001',
  legalName: 'Amina Nsubuga',
  companyEmail: 'amina@egypro.test',
  workPhone: '+256700000001',
  active: true,
  departmentName: 'Operations',
  jobTitleName: 'Technician',
  startDate: '2025-01-10',
  endDate: null,
} as const

function createApi(): EmployeeApi {
  return {
    list: vi.fn().mockResolvedValue([employee]),
    get: vi.fn().mockResolvedValue(employee),
    setup: vi.fn().mockResolvedValue({ departments: [], jobTitles: [], payGrades: [] }),
    create: vi.fn().mockResolvedValue(employee),
    update: vi.fn().mockResolvedValue(employee),
    archive: vi.fn().mockResolvedValue(undefined),
    offboard: vi.fn().mockResolvedValue(undefined),
  }
}

test('searches employees and opens their dossier', async () => {
  const user = userEvent.setup()
  renderWithProviders(<EmployeeDirectoryPage api={createApi()} />)

  expect(await screen.findByText('Amina Nsubuga')).toBeInTheDocument()
  await user.type(screen.getByRole('searchbox', { name: /search employees/i }), 'missing')
  expect(screen.queryByText('Amina Nsubuga')).not.toBeInTheDocument()
  expect(screen.getByText(/no employees match/i)).toBeInTheDocument()

  await user.clear(screen.getByRole('searchbox', { name: /search employees/i }))
  expect(screen.getByRole('link', { name: /view amina nsubuga/i })).toHaveAttribute(
    'href',
    '/hr/employees/employee-1',
  )
})

test('creates an employee from the directory', async () => {
  const user = userEvent.setup()
  const api = createApi()
  renderWithProviders(<EmployeeDirectoryPage api={api} />)

  await screen.findByText('Amina Nsubuga')
  await user.click(screen.getByRole('button', { name: /add employee/i }))
  expect(screen.getAllByRole('textbox')[0]).toHaveAccessibleName(/full name/i)
  expect(screen.queryByLabelText(/preferred name/i)).not.toBeInTheDocument()
  await user.type(screen.getByLabelText(/full name/i), 'Dora Atim')
  await user.type(screen.getByLabelText(/nin \/ passport/i), 'CM1234567890')
  await user.type(screen.getByLabelText(/employee number/i), 'EGY-002')
  await user.type(screen.getByLabelText(/start date/i), '2026-07-11')
  await user.type(screen.getByLabelText(/gross monthly salary/i), '2500000')
  await user.type(screen.getByLabelText(/tin number/i), '1012345678')
  await user.click(screen.getByRole('button', { name: /save employee/i }))

  await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
    employeeNumber: 'EGY-002',
    fullName: 'Dora Atim',
    nationalId: 'CM1234567890',
    startDate: '2026-07-11',
    grossSalary: '2500000',
    tinNumber: '1012345678',
  })))
})
