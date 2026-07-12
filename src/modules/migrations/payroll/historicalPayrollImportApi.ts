import { getSupabaseClient } from '../../../lib/supabase/client'
import { employeeApi } from '../../hr/api/employees'
import {
  parseHistoricalPayrollWorkbookInWorker,
  type HistoricalPayrollMapping,
  type HistoricalPayrollParseResult,
  type HistoricalPayrollRow,
  type ParsedHistoricalPayrollPeriod,
} from './parseHistoricalWorkbook.worker'
import { reconcileHistoricalEmployees, type ExistingHistoricalEmployee } from './reconcileEmployees'

export interface HistoricalPayrollStage {
  parsed: HistoricalPayrollParseResult
  unmatchedRows: Array<{ periodStart: string; rowNumber: number; employeeNumber: string; employeeName: string; reason: string }>
  rowsReadyForCommit: number
}

export interface HistoricalPayrollCommitResult {
  batchId: string
  periods: number
  rows: number
}

export interface HistoricalPayrollImportApi {
  stage(file: File, mappings?: HistoricalPayrollMapping[]): Promise<HistoricalPayrollStage>
  commit(file: File, stage: HistoricalPayrollStage): Promise<HistoricalPayrollCommitResult>
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function existingEmployees(): Promise<ExistingHistoricalEmployee[]> {
  return (await employeeApi.list()).map((employee) => ({
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    legalName: employee.legalName,
    companyEmail: employee.companyEmail,
  }))
}

function attachEmployeeIds(period: ParsedHistoricalPayrollPeriod, existing: ExistingHistoricalEmployee[]) {
  const reconciliation = reconcileHistoricalEmployees(period.rows, existing)
  const byKey = new Map<string, string>()
  for (const match of reconciliation.matches) {
    if (match.employeeNumber) byKey.set(`number:${match.employeeNumber.toUpperCase()}`, match.employeeId)
    byKey.set(`name:${match.employeeName.toLowerCase()}`, match.employeeId)
  }
  const rows = period.rows.map((row) => ({
    ...row,
    employeeId: row.employeeNumber ? byKey.get(`number:${row.employeeNumber.toUpperCase()}`) : undefined,
  }))
  return { rows, conflicts: reconciliation.conflicts }
}

function toRpcRow(row: HistoricalPayrollRow & { employeeId?: string }) {
  return {
    row_number: row.rowNumber,
    row_hash: row.rowHash,
    employee_id: row.employeeId,
    employee_number: row.employeeNumber,
    employee_name: row.employeeName,
    tax_treatment: row.taxTreatment,
    nssf_applicable: row.nssfApplicable,
    percent_of_month_worked: row.percentOfMonthWorked,
    contractual_gross: row.contractualGross,
    prorated_gross: row.proratedGross,
    overtime_hours: row.overtimeHours,
    overtime_rate: row.overtimeRate,
    overtime_pay: row.overtimePay,
    allowances: row.allowances,
    taxable_gross: row.taxableGross,
    paye: row.paye,
    nssf_employee: row.nssfEmployee,
    nssf_employer: row.nssfEmployer,
    wht: row.wht,
    salary_advance_deduction: row.salaryAdvanceDeduction,
    other_deductions: row.otherDeductions,
    total_deductions: row.totalDeductions,
    net_pay: row.netPay,
    tin_number: row.tinNumber,
    nssf_number: row.nssfNumber,
    payment_method: row.paymentMethod,
    bank_name: row.bankName,
    account_number: row.accountNumber,
    sort_code: row.sortCode,
    mobile_money_number: row.mobileMoneyNumber,
  }
}

function toRpcPeriod(period: ParsedHistoricalPayrollPeriod, rows: Array<HistoricalPayrollRow & { employeeId?: string }>) {
  return {
    sheet_name: period.sheetName,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    label: period.label,
    totals: {
      gross: period.totals.gross,
      paye: period.totals.paye,
      nssf_employee: period.totals.nssfEmployee,
      nssf_employer: period.totals.nssfEmployer,
      wht: period.totals.wht,
      deductions: period.totals.deductions,
      net: period.totals.net,
    },
    rows: rows.map(toRpcRow),
  }
}

async function stage(file: File, mappings: HistoricalPayrollMapping[] = []): Promise<HistoricalPayrollStage> {
  const [parsed, existing] = await Promise.all([parseHistoricalPayrollWorkbookInWorker(file, mappings), existingEmployees()])
  const unmatchedRows: HistoricalPayrollStage['unmatchedRows'] = []
  let rowsReadyForCommit = 0
  for (const period of parsed.periods) {
    const attached = attachEmployeeIds(period, existing)
    rowsReadyForCommit += attached.rows.filter((row) => row.employeeId).length
    for (const conflict of attached.conflicts) {
      unmatchedRows.push({ periodStart: period.periodStart, rowNumber: 0, employeeNumber: conflict.employeeNumber, employeeName: conflict.employeeName, reason: conflict.reason })
    }
    for (const row of attached.rows) {
      if (!row.employeeId) unmatchedRows.push({ periodStart: period.periodStart, rowNumber: row.rowNumber, employeeNumber: row.employeeNumber, employeeName: row.employeeName, reason: 'No employee number or email match found in OneHub.' })
    }
  }
  return { parsed, unmatchedRows, rowsReadyForCommit }
}

async function commit(file: File, staged: HistoricalPayrollStage) {
  const existing = await existingEmployees()
  const periods = staged.parsed.periods.map((period) => {
    const attached = attachEmployeeIds(period, existing)
    return toRpcPeriod(period, attached.rows)
  })
  const { data, error } = await getSupabaseClient().rpc('commit_historical_payroll_import', {
    source_file_name: file.name,
    source_file_hash: await sha256(file),
    import_periods: periods,
  })
  if (error) throw error
  return data as HistoricalPayrollCommitResult
}

export const historicalPayrollImportApi: HistoricalPayrollImportApi = { stage, commit }
