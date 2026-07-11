import { expect, test } from 'vitest'

import { validateEmployeeRows } from './employeeParser'

test('classifies additions and identifier-based updates without fuzzy name matching', () => {
  const result = validateEmployeeRows([
    { rowNumber: 2, full_name: 'Dora Atim', employee_number: 'EGY-002', start_date: '2026-07-11' },
    { rowNumber: 3, full_name: 'Amina Nsubuga', employee_number: 'EGY-001', company_email: 'new@egypro.test', start_date: '2025-01-10' },
    { rowNumber: 4, full_name: 'Amina Nsubuga', employee_number: 'EGY-099', start_date: '2026-07-11' },
  ], [{ id: 'employee-1', employeeNumber: 'EGY-001', legalName: 'Amina Nsubuga', companyEmail: 'amina@egypro.test', nationalId: null }])

  expect(result.rows.map((row) => row.action)).toEqual(['create', 'update', 'create'])
  expect(result.rows[1]?.employeeId).toBe('employee-1')
})

test('reports exact row errors and duplicate identifiers', () => {
  const result = validateEmployeeRows([
    { rowNumber: 2, full_name: '', employee_number: 'EGY-001', start_date: 'bad-date' },
    { rowNumber: 3, full_name: 'Second Person', employee_number: 'EGY-001', start_date: '2026-07-11' },
  ], [])

  expect(result.valid).toBe(false)
  expect(result.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ rowNumber: 2, field: 'full_name' }),
    expect.objectContaining({ rowNumber: 2, field: 'start_date' }),
    expect.objectContaining({ rowNumber: 3, field: 'employee_number' }),
  ]))
})

test('requires an end date for fixed-term contracts', () => {
  const result = validateEmployeeRows([{ rowNumber: 2, full_name: 'Fixed Term', employee_number: 'EGY-003', start_date: '2026-07-11', contract_type: 'fixed_term' }], [])
  expect(result.errors).toContainEqual(expect.objectContaining({ field: 'contract_end_date' }))
})
