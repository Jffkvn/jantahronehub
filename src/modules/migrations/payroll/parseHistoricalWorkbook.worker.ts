import * as XLSX from '@e965/xlsx'

export interface HistoricalPayrollMapping {
  sheetName: string
  periodStart: string
}

export interface HistoricalPeriod {
  periodStart: string
  periodEnd: string
  label: string
}

export interface HistoricalPayrollRow {
  rowNumber: number
  rowHash: string
  employeeNumber: string
  employeeName: string
  companyEmail: string | null
  tinNumber: string | null
  nssfNumber: string | null
  paymentMethod: 'bank' | 'mobile_money' | 'cash'
  bankName: string | null
  accountNumber: string | null
  sortCode: string | null
  mobileMoneyNumber: string | null
  taxTreatment: 'local' | 'global' | 'contractor' | 'exempt'
  nssfApplicable: boolean
  percentOfMonthWorked: number
  contractualGross: number
  proratedGross: number
  overtimeHours: number
  overtimeRate: number
  overtimePay: number
  allowances: number
  taxableGross: number
  paye: number
  nssfEmployee: number
  nssfEmployer: number
  wht: number
  salaryAdvanceDeduction: number
  otherDeductions: number
  totalDeductions: number
  netPay: number
}

export interface ParsedHistoricalPayrollPeriod extends HistoricalPeriod {
  sheetName: string
  rowCount: number
  totals: {
    gross: number
    paye: number
    nssfEmployee: number
    nssfEmployer: number
    wht: number
    deductions: number
    net: number
  }
  rows: HistoricalPayrollRow[]
}

export interface HistoricalPayrollParseError {
  sheetName: string
  rowNumber?: number
  message: string
}

export interface HistoricalPayrollSkippedSheet {
  sheetName: string
  reason: 'summary_sheet' | 'non_payroll_sheet' | 'requires_mapping' | 'missing_columns' | 'empty_sheet'
}

interface StaffDetailRow {
  employeeNumber: string
  fullName: string
  jobTitle: string | null
  department: string | null
  companyEmail: string | null
  personalEmail: string | null
  phone: string | null
  nssfNumber: string | null
  tinNumber: string | null
  nationalId: string | null
  gender: string | null
  dateOfBirth: string | null
  startDate: string | null
  endDate: string | null
  contractType: string | null
}

export interface HistoricalPayrollParseResult {
  periods: ParsedHistoricalPayrollPeriod[]
  staffDetails: StaffDetailRow[]
  skippedSheets: HistoricalPayrollSkippedSheet[]
  errors: HistoricalPayrollParseError[]
}

export interface CurrentEmployeeRecommendation {
  employeeNumber: string
  fullName: string
  currentStatus: 'active' | 'inactive' | 'needs_review'
  companyEmail: string | null
  department: string | null
  jobTitle: string | null
  startDate: string | null
  endDate: string | null
}

const months = new Map([
  ['january', 0],
  ['february', 1],
  ['march', 2],
  ['april', 3],
  ['may', 4],
  ['june', 5],
  ['july', 6],
  ['august', 7],
  ['september', 8],
  ['october', 9],
  ['november', 10],
  ['december', 11],
])

const monthLabels = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function periodFromStart(periodStart: string): HistoricalPeriod {
  const [yearText, monthText] = periodStart.split('-')
  const year = Number(yearText)
  const month = Number(monthText) - 1
  const end = new Date(Date.UTC(year, month + 1, 0))
  return {
    periodStart,
    periodEnd: `${year}-${pad(month + 1)}-${pad(end.getUTCDate())}`,
    label: `${monthLabels[month]} ${year}`,
  }
}

export function detectHistoricalPayrollPeriod(
  sheetName: string,
  mappings: HistoricalPayrollMapping[] = [],
): HistoricalPeriod | null {
  const mapped = mappings.find((mapping) => mapping.sheetName === sheetName)
  if (mapped) return periodFromStart(mapped.periodStart)
  const lowered = sheetName.toLowerCase()
  const monthEntry = [...months.entries()].find(([month]) => lowered.includes(month))
  const yearMatch = lowered.match(/\b(20\d{2})\b/)
  if (!monthEntry || !yearMatch) return null
  return periodFromStart(`${yearMatch[1]}-${pad(monthEntry[1] + 1)}-01`)
}

function normalizedHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function text(value: unknown) {
  const result = String(value ?? '').trim()
  return result || null
}

function number(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  const cleaned = String(value ?? '').replace(/[, ]/g, '').trim()
  if (!cleaned) return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function rowHash(parts: unknown[]) {
  const source = JSON.stringify(parts)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function parseDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30 + value))
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const year = slash[3].length === 2 ? Number(`20${slash[3]}`) : Number(slash[3])
    return `${year}-${pad(Number(slash[1]))}-${pad(Number(slash[2]))}`
  }
  return raw
}

function cellValue(sheet: XLSX.WorkSheet, row: number, column: number) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
  return cell?.w ?? cell?.v ?? ''
}

function findHeader(sheet: XLSX.WorkSheet) {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  if (!range) return null
  let best: { row: number; columns: Map<string, number>; score: number } | null = null
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 12); row += 1) {
    const columns = new Map<string, number>()
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const label = normalizedHeader(cellValue(sheet, row, column))
      if (label) columns.set(label, column)
    }
    const score = [
      'firstname',
      'lastname',
      'companyidno',
      'basicsalary',
      'grosssalary',
      'salaryugxnet',
      'name',
      'companyidnumber',
      'startdate',
    ].filter((key) => columns.has(key)).length
    if (!best || score > best.score) best = { row, columns, score }
  }
  return best && best.score > 1 ? best : null
}

function column(columns: Map<string, number>, ...aliases: string[]) {
  for (const alias of aliases) {
    const found = columns.get(alias)
    if (found != null) return found
  }
  return null
}

function value(sheet: XLSX.WorkSheet, row: number, columns: Map<string, number>, ...aliases: string[]) {
  const index = column(columns, ...aliases)
  return index == null ? '' : cellValue(sheet, row, index)
}

function paymentMethod(raw: unknown, accountNumber: string | null, mobileMoneyNumber: string | null): HistoricalPayrollRow['paymentMethod'] {
  const mode = String(raw ?? '').toLowerCase()
  if (mode.includes('bank')) return 'bank'
  if (mode.includes('mobile') || mode.includes('mtn') || mode.includes('airtel')) return 'mobile_money'
  if (accountNumber) return 'bank'
  if (mobileMoneyNumber) return 'mobile_money'
  return 'cash'
}

function taxTreatment(type: unknown, paye: number, wht: number): HistoricalPayrollRow['taxTreatment'] {
  const raw = String(type ?? '').toLowerCase()
  if (raw.includes('contract')) return 'contractor'
  if (raw.includes('global')) return 'global'
  if (raw.includes('exempt')) return 'exempt'
  if (wht > 0 && paye === 0) return 'contractor'
  return 'local'
}

function isPayrollSheet(sheetName: string) {
  return /payroll|20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december/i.test(sheetName)
}

function parsePayrollSheet(sheetName: string, sheet: XLSX.WorkSheet, period: HistoricalPeriod) {
  const header = findHeader(sheet)
  if (!header) {
    return { period: null, error: { sheetName, message: 'Could not find a payroll header row.' } }
  }
  const hasMinimumColumns =
    column(header.columns, 'firstname') != null &&
    column(header.columns, 'lastname') != null &&
    column(header.columns, 'companyidno') != null &&
    column(header.columns, 'grosssalary') != null &&
    column(header.columns, 'salaryugxnet') != null
  if (!hasMinimumColumns) {
    return { period: null, error: { sheetName, message: 'Payroll sheet is missing required payroll columns.' } }
  }
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
  const rows: HistoricalPayrollRow[] = []
  for (let row = header.row + 1; row <= range.e.r; row += 1) {
    const firstName = text(value(sheet, row, header.columns, 'firstname'))
    const lastName = text(value(sheet, row, header.columns, 'lastname'))
    const employeeNumber = text(value(sheet, row, header.columns, 'companyidno')) ?? ''
    const employeeName = [firstName, lastName].filter(Boolean).join(' ').trim()
    const contractualGross = number(value(sheet, row, header.columns, 'basicsalary'))
    const taxableGross = number(value(sheet, row, header.columns, 'grosssalary'))
    const netPay = number(value(sheet, row, header.columns, 'salaryugxnet'))
    if (!employeeName && !employeeNumber && contractualGross === 0 && taxableGross === 0 && netPay === 0) continue
    if (!employeeName || taxableGross <= 0) continue

    const accountNumber = text(value(sheet, row, header.columns, 'accountnumber'))
    const mobileMoneyNumber = text(value(sheet, row, header.columns, 'phonenumber'))
    const paye = number(value(sheet, row, header.columns, 'paye'))
    const nssfEmployee = number(value(sheet, row, header.columns, 'nssfemployee5'))
    const nssfEmployer = number(value(sheet, row, header.columns, 'nssfemployer10'))
    const wht = number(value(sheet, row, header.columns, 'withholdingtax'))
    const salaryAdvanceDeduction = number(value(sheet, row, header.columns, 'advancededuction'))
    const totalDeductions = number(value(sheet, row, header.columns, 'totaldeductions'))
    const cashBenefits = number(value(sheet, row, header.columns, 'cashbenefits'))
    const nonCashBenefits = number(value(sheet, row, header.columns, 'noncashbenefits'))
    const overtimePay = number(value(sheet, row, header.columns, 'overtime'))
    const allowances = cashBenefits + nonCashBenefits
    const otherDeductions = Math.max(0, totalDeductions - paye - nssfEmployee - wht - salaryAdvanceDeduction)
    const percentOfMonthWorked = number(value(sheet, row, header.columns, 'ofmonthworked')) || 100
    const method = paymentMethod(value(sheet, row, header.columns, 'paymentmode'), accountNumber, mobileMoneyNumber)
    const payrollRow: HistoricalPayrollRow = {
      rowNumber: row + 1,
      rowHash: '',
      employeeNumber,
      employeeName,
      companyEmail: text(value(sheet, row, header.columns, 'companyemail')),
      tinNumber: text(value(sheet, row, header.columns, 'tinnumber')),
      nssfNumber: text(value(sheet, row, header.columns, 'nssfnumber')),
      paymentMethod: method,
      bankName: null,
      accountNumber,
      sortCode: text(value(sheet, row, header.columns, 'sortcodes')),
      mobileMoneyNumber,
      taxTreatment: taxTreatment(value(sheet, row, header.columns, 'type'), paye, wht),
      nssfApplicable: nssfEmployee > 0 || nssfEmployer > 0,
      percentOfMonthWorked,
      contractualGross,
      proratedGross: Math.max(0, taxableGross - overtimePay - allowances),
      overtimeHours: 0,
      overtimeRate: 0,
      overtimePay,
      allowances,
      taxableGross,
      paye,
      nssfEmployee,
      nssfEmployer,
      wht,
      salaryAdvanceDeduction,
      otherDeductions,
      totalDeductions,
      netPay,
    }
    payrollRow.rowHash = rowHash([period.periodStart, payrollRow.rowNumber, payrollRow.employeeNumber, payrollRow.employeeName, payrollRow.taxableGross, payrollRow.netPay])
    rows.push(payrollRow)
  }
  if (!rows.length) {
    return { period: null, error: { sheetName, message: 'Payroll sheet contains no importable employee rows.' } }
  }
  const totals = rows.reduce(
    (sum, row) => ({
      gross: sum.gross + row.taxableGross,
      paye: sum.paye + row.paye,
      nssfEmployee: sum.nssfEmployee + row.nssfEmployee,
      nssfEmployer: sum.nssfEmployer + row.nssfEmployer,
      wht: sum.wht + row.wht,
      deductions: sum.deductions + row.totalDeductions,
      net: sum.net + row.netPay,
    }),
    { gross: 0, paye: 0, nssfEmployee: 0, nssfEmployer: 0, wht: 0, deductions: 0, net: 0 },
  )
  return { period: { ...period, sheetName, rowCount: rows.length, totals, rows }, error: null }
}

function parseStaffDetails(sheet: XLSX.WorkSheet) {
  const header = findHeader(sheet)
  if (!header) return []
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
  const rows: StaffDetailRow[] = []
  for (let row = header.row + 1; row <= range.e.r; row += 1) {
    const fullName = text(value(sheet, row, header.columns, 'name'))
    const employeeNumber = text(value(sheet, row, header.columns, 'companyidnumber')) ?? ''
    if (!fullName && !employeeNumber) continue
    rows.push({
      employeeNumber,
      fullName: fullName ?? employeeNumber,
      jobTitle: text(value(sheet, row, header.columns, 'title')),
      department: text(value(sheet, row, header.columns, 'department')),
      companyEmail: text(value(sheet, row, header.columns, 'companyemail')),
      personalEmail: text(value(sheet, row, header.columns, 'personalemail')),
      phone: text(value(sheet, row, header.columns, 'mobilenumber')),
      nssfNumber: text(value(sheet, row, header.columns, 'nssfnumber')),
      tinNumber: text(value(sheet, row, header.columns, 'tinnumber')),
      nationalId: text(value(sheet, row, header.columns, 'ninpassportnumber')),
      gender: text(value(sheet, row, header.columns, 'gender')),
      dateOfBirth: parseDate(value(sheet, row, header.columns, 'dateofbirth')),
      startDate: parseDate(value(sheet, row, header.columns, 'startdate')),
      endDate: parseDate(value(sheet, row, header.columns, 'enddate')),
      contractType: text(value(sheet, row, header.columns, 'contract')),
    })
  }
  return rows
}

export async function parseHistoricalPayrollWorkbook(
  file: File,
  mappings: HistoricalPayrollMapping[] = [],
): Promise<HistoricalPayrollParseResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const periods: ParsedHistoricalPayrollPeriod[] = []
  const staffDetails: StaffDetailRow[] = []
  const skippedSheets: HistoricalPayrollSkippedSheet[] = []
  const errors: HistoricalPayrollParseError[] = []
  const seenPeriods = new Set<string>()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet?.['!ref']) {
      skippedSheets.push({ sheetName, reason: 'empty_sheet' })
      continue
    }
    if (sheetName === 'Staff Details') {
      staffDetails.push(...parseStaffDetails(sheet))
      continue
    }
    if (sheetName === 'Staff Advance') {
      skippedSheets.push({ sheetName, reason: 'non_payroll_sheet' })
      continue
    }
    if (/^paye\b/i.test(sheetName)) {
      skippedSheets.push({ sheetName, reason: 'summary_sheet' })
      continue
    }
    if (!isPayrollSheet(sheetName)) {
      skippedSheets.push({ sheetName, reason: 'non_payroll_sheet' })
      continue
    }
    const period = detectHistoricalPayrollPeriod(sheetName, mappings)
    if (!period) {
      skippedSheets.push({ sheetName, reason: 'requires_mapping' })
      continue
    }
    if (seenPeriods.has(period.periodStart)) {
      errors.push({ sheetName, message: 'Duplicate payroll period.' })
      continue
    }
    const parsed = parsePayrollSheet(sheetName, sheet, period)
    if (parsed.period) {
      periods.push(parsed.period)
      seenPeriods.add(period.periodStart)
    } else if (parsed.error) {
      errors.push(parsed.error)
    }
  }
  periods.sort((left, right) => left.periodStart.localeCompare(right.periodStart))
  return { periods, staffDetails, skippedSheets, errors }
}

export function buildHistoricalPayrollPreview(result: HistoricalPayrollParseResult) {
  const latestPeriod = [...result.periods].sort((left, right) => right.periodStart.localeCompare(left.periodStart))[0] ?? null
  const activeKeys = new Set(
    latestPeriod?.rows.flatMap((row) => [
      row.employeeNumber && `number:${row.employeeNumber.toUpperCase()}`,
      row.companyEmail && `email:${row.companyEmail.toLowerCase()}`,
      `name:${row.employeeName.toLowerCase()}`,
    ].filter(Boolean) as string[]) ?? [],
  )
  const currentEmployees: CurrentEmployeeRecommendation[] = result.staffDetails.map((row) => {
    const keys = [
      row.employeeNumber && `number:${row.employeeNumber.toUpperCase()}`,
      row.companyEmail && `email:${row.companyEmail.toLowerCase()}`,
      `name:${row.fullName.toLowerCase()}`,
    ].filter(Boolean) as string[]
    const explicitInactive = Boolean(row.endDate)
    const appearsInLatest = keys.some((key) => activeKeys.has(key))
    return {
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
      currentStatus: explicitInactive ? 'inactive' : appearsInLatest ? 'active' : 'needs_review',
      companyEmail: row.companyEmail,
      department: row.department,
      jobTitle: row.jobTitle,
      startDate: row.startDate,
      endDate: row.endDate,
    }
  })
  const knownNumbers = new Set(currentEmployees.map((employee) => employee.employeeNumber.toUpperCase()).filter(Boolean))
  for (const row of latestPeriod?.rows ?? []) {
    if (row.employeeNumber && knownNumbers.has(row.employeeNumber.toUpperCase())) continue
    currentEmployees.push({
      employeeNumber: row.employeeNumber,
      fullName: row.employeeName,
      currentStatus: 'active',
      companyEmail: row.companyEmail,
      department: null,
      jobTitle: null,
      startDate: null,
      endDate: null,
    })
  }
  return {
    latestPeriod,
    periodCount: result.periods.length,
    rowCount: result.periods.reduce((total, period) => total + period.rowCount, 0),
    currentEmployees,
    needsMapping: result.skippedSheets.filter((sheet) => sheet.reason === 'requires_mapping'),
    errors: result.errors,
  }
}

export function parseHistoricalPayrollWorkbookInWorker(
  file: File,
  mappings: HistoricalPayrollMapping[] = [],
): Promise<HistoricalPayrollParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parseHistoricalWorkbook.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ result?: HistoricalPayrollParseResult; error?: string }>) => {
      worker.terminate()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.result ?? { periods: [], staffDetails: [], skippedSheets: [], errors: [] })
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Historical payroll workbook processing failed.'))
    }
    worker.postMessage({ file, mappings })
  })
}

if (typeof self !== 'undefined' && !('document' in self)) {
  const workerCtx = self as unknown as {
    onmessage: ((this: void, ev: MessageEvent<{ file: File; mappings?: HistoricalPayrollMapping[] }>) => void) | null
    postMessage(message: { result?: HistoricalPayrollParseResult; error?: string }): void
  }
  workerCtx.onmessage = (event: MessageEvent<{ file: File; mappings?: HistoricalPayrollMapping[] }>) => {
    parseHistoricalPayrollWorkbook(event.data.file, event.data.mappings ?? [])
      .then((result) => workerCtx.postMessage({ result }))
      .catch((error: unknown) => {
        workerCtx.postMessage({ error: error instanceof Error ? error.message : 'Workbook could not be read.' })
      })
  }
}

