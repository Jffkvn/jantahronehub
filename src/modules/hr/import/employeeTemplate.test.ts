import { expect, test } from 'vitest'

import { employeeTemplateColumns } from './employeeTemplate'

test('starts the operational template with full name and contains stable identifiers', () => {
  expect(employeeTemplateColumns[0]).toEqual({ key: 'full_name', label: 'Full Name *' })
  expect(employeeTemplateColumns.map((column) => column.key)).toEqual(expect.arrayContaining([
    'employee_number', 'company_email', 'national_id', 'gross_salary', 'employee_tax_type',
  ]))
  expect(employeeTemplateColumns.map((column) => String(column.key))).not.toContain('preferred_name')
})
