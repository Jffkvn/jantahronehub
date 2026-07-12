import { describe, expect, test } from 'vitest'
import * as XLSX from '@e965/xlsx'

import {
  buildHistoricalPayrollPreview,
  detectHistoricalPayrollPeriod,
  parseHistoricalPayrollWorkbook,
  type HistoricalPayrollMapping,
} from './parseHistoricalWorkbook.worker'

function workbookFile(workbook: XLSX.WorkBook, name = 'history.xlsx') {
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: unknown[][]) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
}

const payrollHeader = [
  '#',
  'First Name',
  'Last Name',
  'Company ID NO',
  'Company Email',
  'Sort Codes',
  'Account Number',
  'Phone number',
  'TIN Number',
  'NSSF Number',
  'Basic Salary',
  '% of month worked',
  'Account Deactivation Date',
  'Level',
  'Team',
  'Type',
  'Payment Mode',
  'Overtime',
  'Cash Benefits',
  'Non cash benefits',
  'Gross Salary',
  'PAYE',
  'NSSF (Employee 5%)',
  'NSSF   (Employer 10%)',
  'NSSF (15%)',
  'LST',
  'Advance Deduction',
  'Withholding Tax',
  'Total Deductions',
  'Salary UGX (Net)',
]

const staffHeader = [
  '#',
  'Name',
  'Title',
  'Start Date',
  'Department',
  'Company Email',
  'Contract',
  'Personal Email',
  'Mobile Number',
  'NSSF Number',
  'TIN Number',
  'Company ID Number',
  'NIN/Passport Number',
  'Gender',
  'Date Of Birth',
  'End Date',
]

describe('historical payroll period detection', () => {
  test('detects unambiguous month-year sheet names', () => {
    expect(detectHistoricalPayrollPeriod('June 2026')).toEqual({
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      label: 'June 2026',
    })
    expect(detectHistoricalPayrollPeriod('Payroll January 2024')).toEqual({
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
      label: 'January 2024',
    })
  })

  test('requires explicit mapping when a sheet name lacks a year', () => {
    expect(detectHistoricalPayrollPeriod('Payroll September')).toBeNull()
  })

  test('accepts explicit sheet mappings for legacy names', () => {
    const mapping: HistoricalPayrollMapping = {
      sheetName: 'Payroll September',
      periodStart: '2023-09-01',
    }

    expect(detectHistoricalPayrollPeriod(mapping.sheetName, [mapping])).toEqual({
      periodStart: '2023-09-01',
      periodEnd: '2023-09-30',
      label: 'September 2023',
    })
  })
})

describe('historical payroll workbook parsing', () => {
  test('parses full payroll sheets, skips PAYE summaries, and rejects duplicate periods', async () => {
    const workbook = XLSX.utils.book_new()
    appendSheet(workbook, 'June 2026', [
      ['EGYPRO PAYROLL'],
      payrollHeader,
      [
        1,
        'Amina',
        'Nsubuga',
        'EGY-001',
        'amina@egypro.test',
        'ABC',
        '123',
        '0772000000',
        'TIN1',
        'NSSF1',
        1_000_000,
        100,
        '',
        'L1',
        'Ops',
        'Local',
        'Bank',
        2,
        50_000,
        25_000,
        1_075_000,
        100_000,
        53_750,
        107_500,
        161_250,
        0,
        20_000,
        0,
        173_750,
        901_250,
      ],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ])
    appendSheet(workbook, 'PAYE of May 2025', [['EGYPRO PAYE'], payrollHeader])
    appendSheet(workbook, 'June 2026 Copy', [['EGYPRO PAYROLL'], payrollHeader])

    const result = await parseHistoricalPayrollWorkbook(workbookFile(workbook))

    expect(result.skippedSheets).toContainEqual(
      expect.objectContaining({ sheetName: 'PAYE of May 2025', reason: 'summary_sheet' }),
    )
    expect(result.errors).toContainEqual(
      expect.objectContaining({ sheetName: 'June 2026 Copy', message: 'Duplicate payroll period.' }),
    )
    expect(result.periods[0]).toEqual(
      expect.objectContaining({
        sheetName: 'June 2026',
        periodStart: '2026-06-01',
        rowCount: 1,
        totals: expect.objectContaining({ gross: 1_075_000, net: 901_250 }),
      }),
    )
    expect(result.periods[0]?.rows[0]).toEqual(
      expect.objectContaining({
        rowNumber: 3,
        employeeNumber: 'EGY-001',
        employeeName: 'Amina Nsubuga',
        paymentMethod: 'bank',
      }),
    )
  })

  test('builds current profile recommendations from latest payroll plus staff details', async () => {
    const workbook = XLSX.utils.book_new()
    appendSheet(workbook, 'May 2026', [
      ['EGYPRO PAYROLL'],
      payrollHeader,
      [1, 'Active', 'Person', 'EGY-001', 'active@egypro.test', '', '', '', '', '', 800_000, 100, '', '', '', 'Local', 'Cash', 0, 0, 0, 800_000, 0, 0, 0, 0, 0, 0, 0, 0, 800_000],
    ])
    appendSheet(workbook, 'June 2026', [
      ['EGYPRO PAYROLL'],
      payrollHeader,
      [1, 'Active', 'Person', 'EGY-001', 'active@egypro.test', '', '', '', '', '', 900_000, 100, '', '', '', 'Local', 'Cash', 0, 0, 0, 900_000, 0, 0, 0, 0, 0, 0, 0, 0, 900_000],
    ])
    appendSheet(workbook, 'Staff Details', [
      ['EGYPRO STAFF'],
      staffHeader,
      [1, 'Active Person', 'Supervisor', '2024-01-01', 'Operations', 'active@egypro.test', 'Permanent', '', '0772000000', '', '', 'EGY-001', 'NIN1', 'Female', '1990-01-01', ''],
      [2, 'Former Person', 'Officer', '2024-01-01', 'Operations', 'former@egypro.test', 'Permanent', '', '0772000001', '', '', 'EGY-002', 'NIN2', 'Male', '1990-01-01', '2025-01-31'],
    ])

    const preview = buildHistoricalPayrollPreview(await parseHistoricalPayrollWorkbook(workbookFile(workbook)))

    expect(preview.latestPeriod?.periodStart).toBe('2026-06-01')
    expect(preview.currentEmployees).toContainEqual(
      expect.objectContaining({
        employeeNumber: 'EGY-001',
        fullName: 'Active Person',
        currentStatus: 'active',
        department: 'Operations',
      }),
    )
    expect(preview.currentEmployees).toContainEqual(
      expect.objectContaining({
        employeeNumber: 'EGY-002',
        currentStatus: 'inactive',
        endDate: '2025-01-31',
      }),
    )
  })
})
