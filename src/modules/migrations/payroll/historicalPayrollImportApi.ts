import { getSupabaseClient } from '../../../lib/supabase/client'
import { employeeApi } from '../../hr/api/employees'
import {
  buildHistoricalEmployeeReview,
  historicalEmployeeReviewKey,
  reconcileHistoricalEmployees,
  type ExistingHistoricalEmployee,
  type HistoricalEmployeeCandidate,
  type HistoricalEmployeeReview,
} from './reconcileEmployees'
import {
  parseHistoricalPayrollWorkbookInWorker,
  type HistoricalPayrollMapping,
  type HistoricalPayrollParseResult,
  type HistoricalPayrollRow,
  type ParsedHistoricalPayrollPeriod,
} from './parseHistoricalWorkbook.worker'

export interface HistoricalPayrollStage {
  parsed: HistoricalPayrollParseResult
  unmatchedRows: Array<{ periodStart: string; rowNumber: number; employeeNumber: string; employeeName: string; reason: string; reviewKey?: string }>
  rowsReadyForCommit: number
  employeeReviews: HistoricalEmployeeReview[]
}

export interface HistoricalPayrollCommitResult {
  batchId: string
  periods: number
  rows: number
}

export interface HistoricalPayrollReviewConfirmation {
  confirmed: boolean
  resolutions: Record<string, string>
}

export interface HistoricalPayrollImportApi {
  stage(file: File, mappings?: HistoricalPayrollMapping[]): Promise<HistoricalPayrollStage>
  commit(file: File, stage: HistoricalPayrollStage, review: HistoricalPayrollReviewConfirmation): Promise<HistoricalPayrollCommitResult>
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

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function contractTypes(raw: string | null): Pick<HistoricalEmployeeCandidate, 'employmentType' | 'contractType'> {
  const value = normalize(raw)
  if (value.includes('consult')) return { employmentType: 'contractor', contractType: 'consultancy' }
  if (value.includes('casual')) return { employmentType: 'casual', contractType: 'casual' }
  if (value.includes('intern')) return { employmentType: 'intern', contractType: 'internship' }
  if (value.includes('fixed') || value.includes('contract')) return { employmentType: 'full_time', contractType: 'fixed_term' }
  return { employmentType: 'full_time', contractType: 'permanent' }
}

function profileCandidates(parsed: HistoricalPayrollParseResult): HistoricalEmployeeCandidate[] {
  const candidates: HistoricalEmployeeCandidate[] = []
  const byNumber = new Map<string, HistoricalEmployeeCandidate>()
  const byEmail = new Map<string, HistoricalEmployeeCandidate>()
  const add = (candidate: HistoricalEmployeeCandidate) => {
    const numberKey = normalize(candidate.employeeNumber)
    const emailKey = normalize(candidate.companyEmail)
    const numberCandidate = numberKey ? byNumber.get(numberKey) : undefined
    const emailCandidate = emailKey ? byEmail.get(emailKey) : undefined
    const current = numberCandidate ?? emailCandidate

    // Conflicting identifiers remain separate so the review cannot silently merge people.
    if (numberCandidate && emailCandidate && numberCandidate !== emailCandidate) {
      numberCandidate.identityConflict = 'Workbook identifiers connect different employee candidates.'
      emailCandidate.identityConflict = 'Workbook identifiers connect different employee candidates.'
      return
    }
    if (!current) {
      candidates.push(candidate)
      if (numberKey) byNumber.set(numberKey, candidate)
      if (emailKey) byEmail.set(emailKey, candidate)
      return
    }

    if (
      (numberKey && normalize(current.employeeNumber) && numberKey !== normalize(current.employeeNumber))
      || (emailKey && normalize(current.companyEmail) && emailKey !== normalize(current.companyEmail))
    ) {
      current.identityConflict = 'Workbook contains conflicting employee numbers or company emails for this person.'
      return
    }

    const merged = {
      ...current,
      employeeNumber: current.employeeNumber || candidate.employeeNumber,
      employeeName: current.employeeName || candidate.employeeName,
      companyEmail: current.companyEmail || candidate.companyEmail,
      startDate: current.startDate || candidate.startDate,
      endDate: current.endDate || candidate.endDate,
      employmentType: current.employmentType || candidate.employmentType,
      contractType: current.contractType || candidate.contractType,
    }
    Object.assign(current, merged)
    if (normalize(current.employeeNumber)) byNumber.set(normalize(current.employeeNumber), current)
    if (normalize(current.companyEmail)) byEmail.set(normalize(current.companyEmail), current)
  }

  for (const detail of parsed.staffDetails) {
    add({
      employeeNumber: detail.employeeNumber,
      employeeName: detail.fullName,
      companyEmail: detail.companyEmail,
      startDate: detail.startDate,
      endDate: detail.endDate,
      ...contractTypes(detail.contractType),
    })
  }
  for (const period of parsed.periods) {
    for (const row of period.rows) {
      add({
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        companyEmail: row.companyEmail,
        startDate: period.periodStart,
        endDate: null,
        employmentType: row.taxTreatment === 'contractor' ? 'contractor' : 'full_time',
        contractType: row.taxTreatment === 'contractor' ? 'consultancy' : 'permanent',
      })
    }
  }
  return candidates
}

function attachEmployeeIds(
  period: ParsedHistoricalPayrollPeriod,
  existing: ExistingHistoricalEmployee[],
  reviews: HistoricalEmployeeReview[],
  resolutions: Record<string, string> = {},
) {
  const reconciliation = reconcileHistoricalEmployees(period.rows, existing)
  const byIdentifier = new Map<string, string>()
  for (const review of reviews) {
    const employeeId = review.employeeId ?? resolutions[review.reviewKey]
    if (!employeeId) continue
    if (review.employeeNumber) byIdentifier.set(`number:${normalize(review.employeeNumber)}`, employeeId)
    if (review.companyEmail) byIdentifier.set(`email:${normalize(review.companyEmail)}`, employeeId)
    if (resolutions[review.reviewKey]) byIdentifier.set(`name:${normalize(review.employeeName)}`, employeeId)
  }
  for (const match of reconciliation.matches) {
    byIdentifier.set(`row:${match.rowHash}`, match.employeeId)
  }
  const conflictByRow = new Map(reconciliation.conflicts.map((conflict) => [conflict.rowHash, conflict]))
  const rows = period.rows.map((row) => {
    const ids = new Set([
      byIdentifier.get(`row:${row.rowHash}`),
      row.employeeNumber ? byIdentifier.get(`number:${normalize(row.employeeNumber)}`) : undefined,
      row.companyEmail ? byIdentifier.get(`email:${normalize(row.companyEmail)}`) : undefined,
      byIdentifier.get(`name:${normalize(row.employeeName)}`),
    ].filter(Boolean) as string[])
    return {
      ...row,
      employeeId: ids.size === 1 ? [...ids][0] : undefined,
      reconciliationReason: conflictByRow.get(row.rowHash)?.reason,
    }
  })
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
  const employeeReviews = buildHistoricalEmployeeReview(profileCandidates(parsed), existing)
  const unmatchedRows: HistoricalPayrollStage['unmatchedRows'] = []
  let rowsReadyForCommit = 0
  for (const period of parsed.periods) {
    const attached = attachEmployeeIds(period, existing, employeeReviews)
    rowsReadyForCommit += attached.rows.filter((row) => row.employeeId).length
    for (const row of attached.rows) {
      if (!row.employeeId) {
        unmatchedRows.push({
          periodStart: period.periodStart,
          rowNumber: row.rowNumber,
          employeeNumber: row.employeeNumber,
          employeeName: row.employeeName,
          reason: row.reconciliationReason || 'No reviewed employee number or email match found in OneHub.',
          reviewKey: historicalEmployeeReviewKey(row),
        })
      }
    }
  }
  return { parsed, unmatchedRows, rowsReadyForCommit, employeeReviews }
}

async function commit(file: File, staged: HistoricalPayrollStage, review: HistoricalPayrollReviewConfirmation) {
  if (!review.confirmed) throw new Error('Employee profile review must be confirmed before commit.')
  for (const item of staged.employeeReviews) {
    if (item.action !== 'unresolved') continue
    const resolvedEmployeeId = review.resolutions[item.reviewKey]
    if (!resolvedEmployeeId) throw new Error(`Resolve ${item.employeeName} before committing payroll history.`)
    if (item.suggestedEmployeeId && resolvedEmployeeId !== item.suggestedEmployeeId) {
      throw new Error(`The reviewed match for ${item.employeeName} is invalid.`)
    }
  }

  const existing = await existingEmployees()
  const periods = staged.parsed.periods.map((period) => {
    const attached = attachEmployeeIds(period, existing, staged.employeeReviews, review.resolutions)
    if (attached.rows.some((row) => !row.employeeId)) {
      throw new Error(`${period.label} still contains unresolved employee rows.`)
    }
    return toRpcPeriod(period, attached.rows)
  })
  const profileChanges = staged.employeeReviews
    .filter((item) => item.action === 'create' || item.action === 'enrich')
    .map((item) => ({
      action: item.action,
      employee_id: item.employeeId,
      employee_number: item.employeeNumber,
      legal_name: item.employeeName,
      company_email: item.companyEmail,
      start_date: item.startDate,
      end_date: item.endDate,
      employment_type: item.employmentType,
      contract_type: item.contractType,
    }))
  const { data, error } = await getSupabaseClient().rpc('commit_historical_payroll_import_reviewed', {
    source_file_name: file.name,
    source_file_hash: await sha256(file),
    profile_changes: profileChanges,
    import_periods: periods,
  })
  if (error) throw error
  return data as HistoricalPayrollCommitResult
}

export const historicalPayrollImportApi: HistoricalPayrollImportApi = { stage, commit }
