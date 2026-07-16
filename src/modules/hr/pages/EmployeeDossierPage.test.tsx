import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { EmployeeApi } from '../api/employees'
import { EmployeeDossierPage } from './EmployeeDossierPage'

const employee = {
  id: 'employee-1',
  employeeNumber: 'EGY-001',
  legalName: 'Amina Nsubuga',
  companyEmail: 'amina@egypro.test',
  workPhone: '+256700000001',
  active: true,
  departmentName: 'Operations',
  jobTitleName: 'Technician',
  payGradeId: 'grade-1',
  payGradeName: 'Grade One',
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

test('shows the employee pay grade in the current employment record', async () => {
  renderWithProviders(<EmployeeDossierPage employeeId="employee-1" api={createApi()} />)

  expect(await screen.findByText('Pay grade')).toBeInTheDocument()
  expect(screen.getByText('Grade One')).toBeInTheDocument()
})

test('records an employee exit with its accountability details', async () => {
  const user = userEvent.setup()
  const api = createApi()
  renderWithProviders(<EmployeeDossierPage employeeId="employee-1" api={api} />)

  expect(await screen.findByRole('heading', { name: 'Amina Nsubuga' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /record exit/i }))
  await user.type(screen.getByLabelText(/last working day/i), '2026-07-31')
  await user.type(screen.getByLabelText(/exit reason/i), 'Contract completed')
  await user.type(screen.getByLabelText(/clearance notes/i), 'Laptop returned')
  await user.selectOptions(screen.getByLabelText(/final pay status/i), 'pending')
  await user.click(screen.getByRole('button', { name: /confirm exit/i }))

  await waitFor(() => expect(api.offboard).toHaveBeenCalledWith('employee-1', {
    endDate: '2026-07-31',
    exitReason: 'Contract completed',
    exitNotes: 'Laptop returned',
    finalPayStatus: 'pending',
  }))
})

test('edits the employee profile from the dossier', async () => {
  const user = userEvent.setup()
  const api = createApi()
  renderWithProviders(<EmployeeDossierPage employeeId="employee-1" api={api} />)

  await screen.findByRole('heading', { name: 'Amina Nsubuga' })
  await user.click(screen.getByRole('button', { name: /edit employee/i }))
  const fullName = screen.getByLabelText(/full name/i)
  await user.clear(fullName)
  await user.type(fullName, 'Amina Kato')
  await user.click(screen.getByRole('button', { name: /save employee/i }))

  await waitFor(() => expect(api.update).toHaveBeenCalledWith(
    'employee-1',
    expect.objectContaining({ fullName: 'Amina Kato', employeeNumber: 'EGY-001' }),
  ))
})

test('archives an employee only after a reason is supplied', async () => {
  const user = userEvent.setup()
  const api = createApi()
  renderWithProviders(<EmployeeDossierPage employeeId="employee-1" api={api} />)

  await screen.findByRole('heading', { name: 'Amina Nsubuga' })
  await user.click(screen.getByRole('button', { name: /archive employee/i }))
  await user.click(screen.getByRole('button', { name: /^archive$/i }))
  expect(await screen.findByText(/reason must contain/i)).toBeInTheDocument()
  expect(api.archive).not.toHaveBeenCalled()

  await user.type(screen.getByLabelText(/archive reason/i), 'Duplicate employee record')
  await user.click(screen.getByRole('button', { name: /^archive$/i }))
  await waitFor(() => expect(api.archive).toHaveBeenCalledWith(
    'employee-1',
    'Duplicate employee record',
  ))
})
