import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { EmployeeForm } from './EmployeeForm'

const departments = [
  { id: 'operations', name: 'Operations' },
  { id: 'finance', name: 'Finance' },
]

const jobTitles = [
  { id: 'general-manager', name: 'General manager', departmentId: null },
  { id: 'technician', name: 'Technician', departmentId: 'operations' },
  { id: 'accountant', name: 'Accountant', departmentId: 'finance' },
]

test('shows active pay grades in the employee form', () => {
  renderWithProviders(
    <EmployeeForm
      payGrades={[{ id: 'grade-1', name: 'Grade One' }]}
      onSubmit={vi.fn()}
    />,
  )

  expect(screen.getByRole('combobox', { name: /pay grade/i })).toHaveTextContent('Grade One')
})

test('shows company-wide and matching job titles for the selected department', async () => {
  const user = userEvent.setup()
  renderWithProviders(
    <EmployeeForm
      departments={departments}
      jobTitles={jobTitles}
      onSubmit={vi.fn()}
    />,
  )

  const title = screen.getByRole('combobox', { name: /position \/ job title/i })
  expect(title).toHaveTextContent('General manager')
  expect(title).not.toHaveTextContent('Technician')
  expect(title).not.toHaveTextContent('Accountant')

  await user.selectOptions(screen.getByRole('combobox', { name: /department/i }), 'operations')
  expect(title).toHaveTextContent('General manager')
  expect(title).toHaveTextContent('Technician')
  expect(title).not.toHaveTextContent('Accountant')
})

test('clears a job title that is incompatible with a changed department', async () => {
  const user = userEvent.setup()
  renderWithProviders(
    <EmployeeForm
      initialValues={{ departmentId: 'finance', jobTitleId: 'accountant' }}
      departments={departments}
      jobTitles={jobTitles}
      onSubmit={vi.fn()}
    />,
  )

  const title = screen.getByRole('combobox', { name: /position \/ job title/i })
  expect(title).toHaveValue('accountant')
  await user.selectOptions(screen.getByRole('combobox', { name: /department/i }), 'operations')
  expect(title).toHaveValue('')
})
