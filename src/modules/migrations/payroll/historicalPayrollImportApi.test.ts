import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { HistoricalPayrollParseResult, HistoricalPayrollRow } from './parseHistoricalWorkbook.worker'

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  listEmployees: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('./parseHistoricalWorkbook.worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parseHistoricalWorkbook.worker')>()
  return { ...actual, parseHistoricalPayrollWorkbookInWorker: mocks.parse }
})

vi.mock('../../hr/api/employees', () => ({
  employeeApi: { list: mocks.listEmployees },
}))

vi.mock('../../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}))

import { historicalPayrollImportApi } from './historicalPayrollImportApi'

function payrollRow(overrides: Partial<HistoricalPayrollRow> = {}): HistoricalPayrollRow {
  return {
    rowNumber: 2,
    rowHash: 'row-1',
    employeeNumber: '',
    employeeName: 'Email Match',
    companyEmail: 'matched@egypro.test',
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
    contractualGross: 1000000,
    proratedGross: 1000000,
    overtimeHours: 0,
    overtimeRate: 0,
    overtimePay: 0,
    allowances: 0,
    taxableGross: 1000000,
    paye: 100000,
    nssfEmployee: 50000,
    nssfEmployer: 100000,
    wht: 0,
    salaryAdvanceDeduction: 0,
    otherDeductions: 0,
    totalDeductions: 150000,
    netPay: 850000,
    ...overrides,
  }
}

function parsed(rows: HistoricalPayrollRow[], staffDetails: HistoricalPayrollParseResult['staffDetails'] = []): HistoricalPayrollParseResult {
  return {
    periods: [{
      sheetName: 'June 2026',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      label: 'June 2026',
      rowCount: rows.length,
      totals: {
        gross: rows.reduce((sum, row) => sum + row.taxableGross, 0),
        paye: rows.reduce((sum, row) => sum + row.paye, 0),
        nssfEmployee: rows.reduce((sum, row) => sum + row.nssfEmployee, 0),
        nssfEmployer: rows.reduce((sum, row) => sum + row.nssfEmployer, 0),
        wht: rows.reduce((sum, row) => sum + row.wht, 0),
        deductions: rows.reduce((sum, row) => sum + row.totalDeductions, 0),
        net: rows.reduce((sum, row) => sum + row.netPay, 0),
      },
      rows,
    }],
    staffDetails,
    skippedSheets: [],
    errors: [],
  }
}

beforeEach(() => {
  mocks.parse.mockReset()
  mocks.listEmployees.mockReset()
  mocks.rpc.mockReset()
  mocks.listEmployees.mockResolvedValue([{
    id: 'employee-1',
    employeeNumber: 'EGY-001',
    legalName: 'Email Match',
    companyEmail: 'matched@egypro.test',
  }])
})

describe('historicalPayrollImportApi', () => {
  test('stages an email-only payroll row as attached to the matched employee', async () => {
    mocks.parse.mockResolvedValue(parsed([payrollRow()]))

    const stage = await historicalPayrollImportApi.stage(new File(['history'], 'history.xlsx'))

    expect(stage.rowsReadyForCommit).toBe(1)
    expect(stage.unmatchedRows).toHaveLength(0)
  })

  test('previews reviewed employee profiles from latest payroll and Staff Details', async () => {
    mocks.listEmployees.mockResolvedValue([])
    mocks.parse.mockResolvedValue(parsed(
      [payrollRow({ rowHash: 'new-row', employeeNumber: 'EGY-010', employeeName: 'New Employee', companyEmail: 'new@egypro.test' })],
      [{
        employeeNumber: 'EGY-010',
        fullName: 'New Employee',
        jobTitle: 'Technician',
        department: 'Operations',
        companyEmail: 'new@egypro.test',
        personalEmail: null,
        phone: null,
        nssfNumber: null,
        tinNumber: null,
        nationalId: null,
        gender: null,
        dateOfBirth: null,
        startDate: '2026-01-01',
        endDate: null,
        contractType: 'Permanent',
      }],
    ))

    const stage = await historicalPayrollImportApi.stage(new File(['history'], 'history.xlsx'))

    expect(stage.employeeReviews).toContainEqual(expect.objectContaining({
      action: 'create',
      employeeNumber: 'EGY-010',
      startDate: '2026-01-01',
    }))
    expect(stage.rowsReadyForCommit).toBe(1)
  })

  test('merges a Staff Details number with an email-only payroll candidate', async () => {
    mocks.listEmployees.mockResolvedValue([])
    mocks.parse.mockResolvedValue(parsed(
      [payrollRow({ rowHash: 'email-only-new', employeeNumber: '', employeeName: 'New Employee', companyEmail: 'new@egypro.test' })],
      [{
        employeeNumber: 'EGY-010',
        fullName: 'New Employee',
        jobTitle: 'Technician',
        department: 'Operations',
        companyEmail: 'new@egypro.test',
        personalEmail: null,
        phone: null,
        nssfNumber: null,
        tinNumber: null,
        nationalId: null,
        gender: null,
        dateOfBirth: null,
        startDate: '2026-01-01',
        endDate: null,
        contractType: 'Permanent',
      }],
    ))

    const stage = await historicalPayrollImportApi.stage(new File(['history'], 'history.xlsx'))

    expect(stage.employeeReviews).toHaveLength(1)
    expect(stage.employeeReviews[0]).toEqual(expect.objectContaining({
      action: 'create',
      employeeNumber: 'EGY-010',
      companyEmail: 'new@egypro.test',
    }))
    expect(stage.rowsReadyForCommit).toBe(1)
  })

  test('blocks duplicate workbook identifiers instead of silently merging candidates', async () => {
    mocks.listEmployees.mockResolvedValue([])
    mocks.parse.mockResolvedValue(parsed([
      payrollRow({ rowHash: 'duplicate-1', employeeNumber: 'EGY-010', employeeName: 'First Person', companyEmail: 'shared@egypro.test' }),
      payrollRow({ rowHash: 'duplicate-2', employeeNumber: 'EGY-011', employeeName: 'Second Person', companyEmail: 'shared@egypro.test' }),
    ]))

    const stage = await historicalPayrollImportApi.stage(new File(['history'], 'history.xlsx'))

    expect(stage.employeeReviews).toContainEqual(expect.objectContaining({
      action: 'unresolved',
      reason: 'Workbook contains conflicting employee numbers or company emails for this person.',
    }))
    expect(stage.rowsReadyForCommit).toBe(0)
  })

  test('requires explicit review confirmation before profile changes and payroll history commit', async () => {
    mocks.parse.mockResolvedValue(parsed([payrollRow()]))
    const file = new File(['history'], 'history.xlsx')
    const stage = await historicalPayrollImportApi.stage(file)

    await expect(historicalPayrollImportApi.commit(file, stage, {
      confirmed: false,
      resolutions: {},
    })).rejects.toThrow('Employee profile review must be confirmed before commit.')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  test('commits the confirmed profile review and payroll through the atomic reviewed RPC', async () => {
    mocks.parse.mockResolvedValue(parsed([payrollRow()]))
    mocks.rpc.mockResolvedValue({ data: { batchId: 'batch-1', periods: 1, rows: 1 }, error: null })
    const file = new File(['history'], 'history.xlsx')
    const stage = await historicalPayrollImportApi.stage(file)

    await expect(historicalPayrollImportApi.commit(file, stage, {
      confirmed: true,
      resolutions: {},
    })).resolves.toEqual({ batchId: 'batch-1', periods: 1, rows: 1 })

    expect(mocks.rpc).toHaveBeenCalledWith(
      'commit_historical_payroll_import_reviewed',
      expect.objectContaining({
        source_file_name: 'history.xlsx',
        profile_changes: [],
        import_periods: [expect.objectContaining({ period_start: '2026-06-01' })],
      }),
    )
  })
})
