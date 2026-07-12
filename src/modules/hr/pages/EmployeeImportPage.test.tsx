import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { EmployeeImportApi } from '../api/employeeImports'
import { EmployeeImportPage } from './EmployeeImportPage'

test('previews a valid workbook before committing it', async () => {
  const user = userEvent.setup()
  const api: EmployeeImportApi = {
    existingIdentities: vi.fn().mockResolvedValue([]), setup: vi.fn().mockResolvedValue({ departments: [], jobTitles: [] }), commit: vi.fn().mockResolvedValue({ batchId: 'batch-1', created: 1, updated: 0 }), exportEmployees: vi.fn(),
  }
  const parse = vi.fn().mockResolvedValue([{ rowNumber: 2, full_name: 'Dora Atim', employee_number: 'EGY-002', start_date: '2026-07-11', payment_method: 'cash' }])
  renderWithProviders(<EmployeeImportPage api={api} parse={parse} downloadTemplate={vi.fn()} />)

  await user.upload(screen.getByLabelText(/employee workbook/i), new File(['xlsx'], 'employees.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  expect(await screen.findByText(/1 new employee/i)).toBeInTheDocument()
  expect(api.commit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: /confirm import/i }))
  await waitFor(() => expect(api.commit).toHaveBeenCalledTimes(1))
  expect(await screen.findByText(/import completed/i)).toBeInTheDocument()
})

test('shows row errors and blocks commit', async () => {
  const user = userEvent.setup()
  const api: EmployeeImportApi = { existingIdentities: vi.fn().mockResolvedValue([]), setup: vi.fn().mockResolvedValue({ departments: [], jobTitles: [] }), commit: vi.fn(), exportEmployees: vi.fn() }
  renderWithProviders(<EmployeeImportPage api={api} parse={vi.fn().mockResolvedValue([{ rowNumber: 7, full_name: '', employee_number: '', start_date: 'bad' }])} downloadTemplate={vi.fn()} />)
  await user.upload(screen.getByLabelText(/employee workbook/i), new File(['xlsx'], 'employees.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  expect((await screen.findAllByText(/row 7/i)).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /download error report/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /confirm import/i })).not.toBeInTheDocument()
})
