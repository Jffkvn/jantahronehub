import { describe, expect, test } from 'vitest'

import { reconcileHistoricalEmployees, type ExistingHistoricalEmployee } from './reconcileEmployees'
import type { HistoricalPayrollRow } from './parseHistoricalWorkbook.worker'

function row(overrides: Partial<HistoricalPayrollRow>): HistoricalPayrollRow {
  return {
    rowNumber: 2,
    rowHash: 'row-hash',
    employeeNumber: '',
    employeeName: '',
    companyEmail: null,
    tinNumber: null,
    nssfNumber: null,
    paymentMethod: 'cash',
    bankName: null,
    accountNumber: null,
    sortCode: null,
    mobileMoneyNumber: null,
    taxTreatment: 'local',
    nssfApplicable: true,
    percentOfMonthWorked: 100,
    contractualGross: 0,
    proratedGross: 0,
    overtimeHours: 0,
    overtimeRate: 0,
    overtimePay: 0,
    allowances: 0,
    taxableGross: 0,
    paye: 0,
    nssfEmployee: 0,
    nssfEmployer: 0,
    wht: 0,
    salaryAdvanceDeduction: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    netPay: 0,
    ...overrides,
  }
}

const existing: ExistingHistoricalEmployee[] = [
  {
    id: 'employee-1',
    employeeNumber: 'EGY-001',
    legalName: 'Active Person',
    companyEmail: 'active@egypro.test',
  },
  {
    id: 'employee-2',
    employeeNumber: 'EGY-002',
    legalName: 'Different Email',
    companyEmail: 'shared@egypro.test',
  },
  {
    id: 'employee-3',
    employeeNumber: 'EGY-003',
    legalName: 'Missing Company Email',
    companyEmail: null,
  },
]

describe('historical employee reconciliation', () => {
  test('matches by reliable identifiers and avoids fuzzy name-only commits', () => {
    const result = reconcileHistoricalEmployees(
      [
        row({ employeeNumber: 'EGY-001', employeeName: 'Changed Name' }),
        row({ employeeNumber: 'EGY-099', employeeName: 'Active Person' }),
      ],
      existing,
    )

    expect(result.matches).toContainEqual(
      expect.objectContaining({ employeeNumber: 'EGY-001', employeeId: 'employee-1', action: 'update' }),
    )
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({ employeeName: 'Active Person', reason: 'Name-only match requires manual review.' }),
    )
  })

  test('flags rows whose identifiers point to different existing employees', () => {
    const result = reconcileHistoricalEmployees(
      [row({ employeeNumber: 'EGY-001', companyEmail: 'shared@egypro.test', employeeName: 'Conflict Person' })],
      existing,
    )

    expect(result.matches).toHaveLength(0)
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({ reason: 'Identifiers match different existing employees.' }),
    )
  })

  test('preserves an email-only match for later payroll-row attachment', () => {
    const result = reconcileHistoricalEmployees(
      [row({ rowHash: 'email-only-row', employeeNumber: '', companyEmail: ' ACTIVE@EGYPRO.TEST ', employeeName: 'Active Person' })],
      existing,
    )

    expect(result.conflicts).toHaveLength(0)
    expect(result.matches).toContainEqual(
      expect.objectContaining({
        rowHash: 'email-only-row',
        employeeId: 'employee-1',
        matchedBy: 'email',
      }),
    )
  })

  test('treats duplicate employee-number and email indexes as explicit conflicts', () => {
    const duplicateExisting = [
      ...existing,
      {
        id: 'employee-4',
        employeeNumber: ' egy-001 ',
        legalName: 'Duplicate Number',
        companyEmail: 'duplicate@egypro.test',
      },
      {
        id: 'employee-5',
        employeeNumber: 'EGY-005',
        legalName: 'Duplicate Email',
        companyEmail: ' SHARED@EGYPRO.TEST ',
      },
    ]

    const result = reconcileHistoricalEmployees(
      [
        row({ rowHash: 'duplicate-number', employeeNumber: 'EGY-001', employeeName: 'Number Conflict' }),
        row({ rowHash: 'duplicate-email', employeeNumber: '', companyEmail: 'shared@egypro.test', employeeName: 'Email Conflict' }),
      ],
      duplicateExisting,
    )

    expect(result.matches).toHaveLength(0)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowHash: 'duplicate-number', reason: 'Employee number matches multiple existing employees.' }),
      expect.objectContaining({ rowHash: 'duplicate-email', reason: 'Company email matches multiple existing employees.' }),
    ]))
  })

  test('keeps a name-only match unresolved while exposing the unique suggestion', () => {
    const result = reconcileHistoricalEmployees(
      [row({ rowHash: 'name-only', employeeNumber: 'UNKNOWN', employeeName: 'Active Person' })],
      existing,
    )

    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        rowHash: 'name-only',
        suggestedEmployeeId: 'employee-1',
        reason: 'Name-only match requires manual review.',
      }),
    )
  })

  test('previews reviewed profile creation, enrichment, unchanged and unresolved actions', async () => {
    const module = await import('./reconcileEmployees') as unknown as {
      buildHistoricalEmployeeReview: (
        candidates: Array<Record<string, unknown>>,
        employees: ExistingHistoricalEmployee[],
        createId: () => string,
      ) => Array<Record<string, unknown>>
    }

    let nextId = 0
    const reviews = module.buildHistoricalEmployeeReview(
      [
        { employeeNumber: 'EGY-010', employeeName: 'New Employee', companyEmail: 'new@egypro.test', startDate: '2026-01-01', endDate: null },
        { employeeNumber: 'EGY-003', employeeName: 'Missing Company Email', companyEmail: 'enrich@egypro.test', startDate: '2025-01-01', endDate: null },
        { employeeNumber: 'EGY-001', employeeName: 'Active Person', companyEmail: 'active@egypro.test', startDate: '2025-01-01', endDate: null },
        { employeeNumber: '', employeeName: 'Active Person', companyEmail: null, startDate: '2025-01-01', endDate: null },
      ],
      existing,
      () => `new-employee-${++nextId}`,
    )

    expect(reviews).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'create', employeeId: 'new-employee-1', employeeNumber: 'EGY-010' }),
      expect.objectContaining({ action: 'enrich', employeeId: 'employee-3', changes: ['companyEmail'] }),
      expect.objectContaining({ action: 'unchanged', employeeId: 'employee-1' }),
      expect.objectContaining({ action: 'unresolved', suggestedEmployeeId: 'employee-1' }),
    ]))
  })
})
