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
})
