import { expect, test } from 'vitest'

import { validateEmployeeRows } from './employeeParser'

test('classifies additions and identifier-based updates without fuzzy name matching', () => {
  const result = validateEmployeeRows([
    { rowNumber: 2, full_name: 'Dora Atim', employee_number: 'EGY-002', start_date: '2026-07-11', payment_method: 'cash' },
    { rowNumber: 3, full_name: 'Amina Nsubuga', employee_number: 'EGY-001', company_email: 'new@egypro.test', start_date: '2025-01-10', payment_method: 'cash' },
    { rowNumber: 4, full_name: 'Amina Nsubuga', employee_number: 'EGY-099', start_date: '2026-07-11', payment_method: 'cash' },
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
  const result = validateEmployeeRows([{ rowNumber: 2, full_name: 'Fixed Term', employee_number: 'EGY-003', start_date: '2026-07-11', contract_type: 'fixed_term', payment_method: 'cash' }], [])
  expect(result.errors).toContainEqual(expect.objectContaining({ field: 'contract_end_date' }))
})

test('requires the details for the explicitly selected payment method', () => {
  const result = validateEmployeeRows([{ rowNumber: 2, full_name: 'Bank Employee', employee_number: 'EGY-004', start_date: '2026-07-11', payment_method: 'bank', bank_name: 'Stanbic' }], [])
  expect(result.errors).toContainEqual(expect.objectContaining({ field: 'account_number' }))
})

test('rejects an operational import without an explicit payment method', () => {
  const result = validateEmployeeRows([{ rowNumber: 2, full_name: 'No Route', employee_number: 'EGY-005', start_date: '2026-07-11' }], [])
  expect(result.errors).toContainEqual(expect.objectContaining({ field: 'payment_method' }))
})

test('maps pay grades by code or name without case sensitivity', () => {
  const setup = {
    departments: [],
    jobTitles: [],
    payGrades: [{ id: 'grade-1', code: 'G1', name: 'Grade One' }],
  }
  const result = validateEmployeeRows([
    { rowNumber: 2, full_name: 'Code Match', employee_number: 'EGY-006', start_date: '2026-07-11', payment_method: 'cash', pay_grade: 'g1' },
    { rowNumber: 3, full_name: 'Name Match', employee_number: 'EGY-007', start_date: '2026-07-11', payment_method: 'cash', pay_grade: 'grade one' },
  ], [], setup)

  expect(result.errors).toEqual([])
  expect(result.rows.map((row) => row.values.payGradeId)).toEqual(['grade-1', 'grade-1'])
})

test('reports an unknown pay grade on its exact spreadsheet row', () => {
  const result = validateEmployeeRows([
    { rowNumber: 8, full_name: 'Unknown Grade', employee_number: 'EGY-008', start_date: '2026-07-11', payment_method: 'cash', pay_grade: 'Missing Grade' },
  ], [], { departments: [], jobTitles: [], payGrades: [] })

  expect(result.errors).toContainEqual({
    rowNumber: 8,
    field: 'pay_grade',
    message: 'Pay grade does not exist in OneHub.',
  })
})

test('maps a department-specific job title only within its selected department', () => {
  const result = validateEmployeeRows([
    { rowNumber: 9, full_name: 'Wrong Department', employee_number: 'EGY-009', start_date: '2026-07-11', payment_method: 'cash', department: 'Finance', job_title: 'HR Manager' },
  ], [], {
    departments: [{ id: 'finance', name: 'Finance' }, { id: 'hr', name: 'Human Resources' }],
    jobTitles: [{ id: 'hr-manager', name: 'HR Manager', departmentId: 'hr' }],
    payGrades: [],
  })

  expect(result.errors).toContainEqual({
    rowNumber: 9,
    field: 'job_title',
    message: 'Job title is not available for the selected department.',
  })
})
