import { getSupabaseClient } from '../../../lib/supabase/client'
import { employeeApi, toEmployeeRpcPayload } from './employees'
import type { ExistingEmployeeIdentity, ValidatedImportRow } from '../import/employeeParser'

export interface ImportCommitResult { batchId: string; created: number; updated: number }
export interface EmployeeImportApi {
  existingIdentities(): Promise<ExistingEmployeeIdentity[]>; setup(): ReturnType<typeof employeeApi.setup>; commit(file: File, rows: ValidatedImportRow[]): Promise<ImportCommitResult>; exportEmployees(): Promise<void>
}
async function sha256(file: File) { const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
async function existingIdentities() { return (await employeeApi.list()).map((employee) => ({ id: employee.id, employeeNumber: employee.employeeNumber, legalName: employee.legalName, companyEmail: employee.companyEmail, nationalId: employee.nationalId })) }
const setup = () => employeeApi.setup()
async function commit(file: File, rows: ValidatedImportRow[]) {
  const payload = rows.map((row) => ({ row_number: row.rowNumber, action: row.action, employee_id: row.employeeId ?? null, ...toEmployeeRpcPayload(row.values) }))
  const { data, error } = await getSupabaseClient().rpc('commit_employee_import', { source_file_name: file.name, source_file_hash: await sha256(file), import_rows: payload })
  if (error) throw error
  return data as ImportCommitResult
}
async function exportEmployees() {
  const XLSX = await import('@e965/xlsx'); const employees = await employeeApi.list()
  const rows = employees.map((employee) => ({ 'Full Name': employee.legalName, 'Employee Number': employee.employeeNumber, 'Company Email': employee.companyEmail ?? '', 'Phone': employee.workPhone ?? '', 'Department': employee.departmentName ?? '', 'Position / Job Title': employee.jobTitleName ?? '', 'Start Date': employee.startDate ?? '', 'Gross Salary': employee.grossSalary ?? '', 'Payment Method': employee.paymentMethod ?? 'cash', 'Mobile Money': employee.mobileMoneyNumber ?? '', 'Bank Name': employee.bankName ?? '', 'Account Number': employee.accountNumber ?? '', 'TIN Number': employee.tinNumber ?? '', 'NSSF Number': employee.nssfNumber ?? '', 'Tax Type': employee.employeeTaxType ?? '' }))
  const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(rows); sheet['!cols'] = Object.keys(rows[0] ?? { Employee: '' }).map(() => ({ wch: 22 })); XLSX.utils.book_append_sheet(workbook, sheet, 'Employees')
  const { error } = await getSupabaseClient().rpc('record_employee_export', { exported_count: employees.length }); if (error) throw error
  XLSX.writeFile(workbook, `OneHub_Employees_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true })
}
export const employeeImportApi: EmployeeImportApi = { existingIdentities, setup, commit, exportEmployees }
