import { employeeFormSchema, type EmployeeFormValues } from '../schemas/employee'
import { employeeTemplateColumns } from './employeeTemplate'

export type RawEmployeeRow = Record<string, unknown> & { rowNumber: number }
export interface ExistingEmployeeIdentity { id: string; employeeNumber: string; legalName: string; companyEmail: string | null; nationalId?: string | null }
export interface ImportError { rowNumber: number; field: string; message: string }
export interface ValidatedImportRow { rowNumber: number; action: 'create' | 'update'; employeeId?: string; values: EmployeeFormValues }
export interface ImportSetup {
  departments: Array<{ id: string; name: string }>
  jobTitles: Array<{ id: string; name: string; departmentId?: string | null }>
  payGrades: Array<{ id: string; code?: string; name: string }>
}

const text = (value: unknown) => value == null ? '' : String(value).trim()
function normalized(row: RawEmployeeRow): EmployeeFormValues {
  return {
    fullName: text(row.full_name), nationalId: text(row.national_id), companyEmail: text(row.company_email), personalEmail: text(row.personal_email), phone: text(row.phone),
    gender: text(row.gender).toLowerCase() as EmployeeFormValues['gender'], dateOfBirth: text(row.date_of_birth), departmentId: text(row.department_id), jobTitleId: text(row.job_title_id), payGradeId: text(row.pay_grade_id),
    employmentType: (text(row.employment_type) || 'full_time') as EmployeeFormValues['employmentType'], startDate: text(row.start_date), contractType: (text(row.contract_type) || 'permanent') as EmployeeFormValues['contractType'],
    contractEndDate: text(row.contract_end_date), probationEndDate: text(row.probation_end_date), probationStatus: (text(row.probation_status) || 'not_applicable') as EmployeeFormValues['probationStatus'],
    grossSalary: text(row.gross_salary), currency: 'UGX', customOvertimeRate: text(row.custom_overtime_rate), paymentMethod: text(row.payment_method) as EmployeeFormValues['paymentMethod'], mobileMoneyNumber: text(row.mobile_money_number), bankName: text(row.bank_name), accountNumber: text(row.account_number), sortCode: text(row.sort_code),
    employeeNumber: text(row.employee_number), tinNumber: text(row.tin_number), nssfNumber: text(row.nssf_number), employeeTaxType: (text(row.employee_tax_type) || 'local') as EmployeeFormValues['employeeTaxType'], pctMonthWorked: text(row.pct_month_worked) || '100', whtRate: text(row.wht_rate) || '6',
  }
}

export function validateEmployeeRows(rows: RawEmployeeRow[], existing: ExistingEmployeeIdentity[], setup?: ImportSetup) {
  const errors: ImportError[] = []; const validRows: ValidatedImportRow[] = []; const seenNumbers = new Set<string>(); const seenEmails = new Set<string>(); const seenNins = new Set<string>()
  for (const row of rows) {
    const values = normalized(row); const departmentName = text(row.department); const jobTitleName = text(row.job_title); const payGradeReference = text(row.pay_grade)
    if (departmentName) { const match = setup?.departments.find((item) => item.name.toLowerCase() === departmentName.toLowerCase()); if (!match) errors.push({ rowNumber: row.rowNumber, field: 'department', message: 'Department does not exist in OneHub.' }); else values.departmentId = match.id }
    if (jobTitleName) {
      const titleCandidates = setup?.jobTitles.filter((item) => item.name.toLowerCase() === jobTitleName.toLowerCase()) ?? []
      const match = titleCandidates.find((item) => item.departmentId === values.departmentId)
        ?? titleCandidates.find((item) => !item.departmentId)
      if (!match) errors.push({ rowNumber: row.rowNumber, field: 'job_title', message: titleCandidates.length ? 'Job title is not available for the selected department.' : 'Job title does not exist in OneHub.' })
      else values.jobTitleId = match.id
    }
    if (payGradeReference) {
      const normalizedReference = payGradeReference.toLowerCase()
      const match = setup?.payGrades.find((item) => item.code?.toLowerCase() === normalizedReference || item.name.toLowerCase() === normalizedReference)
      if (!match) errors.push({ rowNumber: row.rowNumber, field: 'pay_grade', message: 'Pay grade does not exist in OneHub.' })
      else values.payGradeId = match.id
    }
    const numberKey = values.employeeNumber.toUpperCase(); const emailKey = values.companyEmail.toLowerCase(); const ninKey = values.nationalId.toUpperCase()
    for (const [field, key, seen] of [['employee_number', numberKey, seenNumbers], ['company_email', emailKey, seenEmails], ['national_id', ninKey, seenNins]] as const) {
      if (!key) continue; if (seen.has(key)) errors.push({ rowNumber: row.rowNumber, field, message: `Duplicate ${field.replaceAll('_', ' ')} in this workbook.` }); else seen.add(key)
    }
    const parsed = employeeFormSchema.safeParse(values)
    if (!parsed.success) { for (const issue of parsed.error.issues) errors.push({ rowNumber: row.rowNumber, field: String(issue.path[0] ?? 'row').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), message: issue.message }); continue }
    const byNumber = existing.find((item) => item.employeeNumber.toUpperCase() === numberKey)
    const byEmail = emailKey ? existing.find((item) => item.companyEmail?.toLowerCase() === emailKey) : undefined
    const byNin = ninKey ? existing.find((item) => item.nationalId?.toUpperCase() === ninKey) : undefined
    const matches = new Set([byNumber?.id, byEmail?.id, byNin?.id].filter(Boolean))
    if (matches.size > 1) { errors.push({ rowNumber: row.rowNumber, field: 'employee_number', message: 'Identifiers match different existing employees.' }); continue }
    const employeeId = [...matches][0]
    validRows.push({ rowNumber: row.rowNumber, action: employeeId ? 'update' : 'create', employeeId, values: parsed.data })
  }
  return { valid: errors.length === 0, rows: validRows, errors }
}

export async function parseEmployeeWorkbook(file: File): Promise<RawEmployeeRow[]> {
  const XLSX = await import('@e965/xlsx'); const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const sheet = workbook.Sheets['Employee Upload']; if (!sheet) throw new Error('The workbook must contain an Employee Upload sheet.')
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  const labelToKey = new Map<string, string>(employeeTemplateColumns.map((column) => [column.label, column.key]))
  return records.map((record, index) => Object.fromEntries([['rowNumber', index + 2], ...Object.entries(record).map(([label, value]) => [labelToKey.get(label) ?? label, value])])) as RawEmployeeRow[]
}

export function parseEmployeeWorkbookInWorker(file: File): Promise<RawEmployeeRow[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./employeeParser.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ rows?: RawEmployeeRow[]; error?: string }>) => { worker.terminate(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.rows ?? []) }
    worker.onerror = () => { worker.terminate(); reject(new Error('Workbook processing failed.')) }
    worker.postMessage(file)
  })
}
