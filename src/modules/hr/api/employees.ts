import { getSupabaseClient } from '../../../lib/supabase/client'
import type { EmployeeSetupOption } from '../components/EmployeeForm'
import type { EmployeeFormValues, OffboardingValues } from '../schemas/employee'

export interface EmployeeSummary {
  id: string; employeeNumber: string; legalName: string; companyEmail: string | null; workPhone: string | null; active: boolean;
  departmentName: string | null; jobTitleName: string | null; startDate: string | null; endDate: string | null;
  nationalId?: string | null; personalEmail?: string | null; gender?: string | null; dateOfBirth?: string | null;
  departmentId?: string | null; jobTitleId?: string | null; employmentType?: EmployeeFormValues['employmentType']; contractType?: EmployeeFormValues['contractType']; contractEndDate?: string | null;
  probationEndDate?: string | null; probationStatus?: EmployeeFormValues['probationStatus']; grossSalary?: number | null; currency?: 'UGX'; customOvertimeRate?: number | null;
  mobileMoneyNumber?: string | null; bankName?: string | null; accountNumber?: string | null; sortCode?: string | null; tinNumber?: string | null; nssfNumber?: string | null;
  employeeTaxType?: EmployeeFormValues['employeeTaxType']; pctMonthWorked?: number; whtRate?: number;
}
export interface EmployeeSetup { departments: EmployeeSetupOption[]; jobTitles: EmployeeSetupOption[] }
export interface EmployeeApi {
  list(): Promise<EmployeeSummary[]>; get(id: string): Promise<EmployeeSummary>; setup(): Promise<EmployeeSetup>;
  create(values: EmployeeFormValues): Promise<EmployeeSummary>; update(id: string, values: EmployeeFormValues): Promise<EmployeeSummary>;
  archive(id: string, reason: string): Promise<void>; offboard(id: string, values: OffboardingValues): Promise<void>
}

type PeriodRow = { start_date: string; end_date: string | null; department_id: string | null; job_title_id: string | null; employment_type: EmployeeFormValues['employmentType']; contract_type: EmployeeFormValues['contractType']; probation_end_date: string | null; probation_status: EmployeeFormValues['probationStatus']; departments: { name: string } | null; job_titles: { name: string } | null }
type ConfidentialRow = Record<string, unknown>
type EmployeeRow = Record<string, unknown> & { id: string; employee_number: string; legal_name: string; company_email: string | null; work_phone: string | null; archived_at: string | null; employment_periods?: PeriodRow[]; employee_confidential_profiles?: ConfidentialRow | ConfidentialRow[] | null }
const employeeSelection = `id, employee_number, legal_name, company_email, personal_email, work_phone, gender, date_of_birth, archived_at, employee_confidential_profiles(national_id,gross_salary,currency_code,custom_overtime_rate,mobile_money_number,bank_name,account_number,sort_code,tin_number,nssf_number,employee_tax_type,pct_month_worked,wht_rate), employment_periods(start_date, end_date, department_id, job_title_id, employment_type, contract_type, probation_end_date, probation_status, departments(name), job_titles(name))`
const optional = (value: unknown) => typeof value === 'string' ? value : null
const numeric = (value: unknown) => value === null || value === undefined ? null : Number(value)

function mapEmployee(row: EmployeeRow): EmployeeSummary {
  const periods = [...(row.employment_periods ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date)); const today = new Date().toISOString().slice(0, 10)
  const current = periods.find((period) => !period.end_date || period.end_date >= today) ?? periods[0]
  const confidentialRelation = row.employee_confidential_profiles
  const confidential = Array.isArray(confidentialRelation) ? confidentialRelation[0] ?? {} : confidentialRelation ?? {}
  return { id: row.id, employeeNumber: row.employee_number, legalName: row.legal_name, companyEmail: row.company_email, workPhone: row.work_phone,
    active: !row.archived_at && Boolean(current && (!current.end_date || current.end_date >= today)), departmentName: current?.departments?.name ?? null, jobTitleName: current?.job_titles?.name ?? null, startDate: current?.start_date ?? null, endDate: current?.end_date ?? null,
    nationalId: optional(confidential.national_id), personalEmail: optional(row.personal_email), gender: optional(row.gender), dateOfBirth: optional(row.date_of_birth), departmentId: current?.department_id, jobTitleId: current?.job_title_id,
    employmentType: current?.employment_type, contractType: current?.contract_type, contractEndDate: current?.end_date, probationEndDate: current?.probation_end_date, probationStatus: current?.probation_status,
    grossSalary: numeric(confidential.gross_salary), currency: 'UGX', customOvertimeRate: numeric(confidential.custom_overtime_rate), mobileMoneyNumber: optional(confidential.mobile_money_number), bankName: optional(confidential.bank_name), accountNumber: optional(confidential.account_number), sortCode: optional(confidential.sort_code), tinNumber: optional(confidential.tin_number), nssfNumber: optional(confidential.nssf_number), employeeTaxType: (optional(confidential.employee_tax_type) as EmployeeFormValues['employeeTaxType']) ?? 'local', pctMonthWorked: numeric(confidential.pct_month_worked) ?? 100, whtRate: numeric(confidential.wht_rate) ?? 6 }
}
async function list() { const { data, error } = await getSupabaseClient().from('employees').select(employeeSelection).is('archived_at', null).order('legal_name'); if (error) throw error; return (data as unknown as EmployeeRow[]).map(mapEmployee) }
async function get(id: string) { const { data, error } = await getSupabaseClient().from('employees').select(employeeSelection).eq('id', id).single(); if (error) throw error; return mapEmployee(data as unknown as EmployeeRow) }
async function setup() {
  const client = getSupabaseClient(); const [departments, jobTitles] = await Promise.all([client.from('departments').select('id,name').is('archived_at', null).order('name'), client.from('job_titles').select('id,name,department_id').is('archived_at', null).order('name')])
  if (departments.error) throw departments.error; if (jobTitles.error) throw jobTitles.error
  return { departments: departments.data.map((row) => ({ id: row.id, name: row.name })), jobTitles: jobTitles.data.map((row) => ({ id: row.id, name: row.name, departmentId: row.department_id })) }
}
export function toEmployeeRpcPayload(values: EmployeeFormValues) { return { employee_data: { employee_number: values.employeeNumber, legal_name: values.fullName, national_id: values.nationalId || null, company_email: values.companyEmail || null, personal_email: values.personalEmail || null, work_phone: values.phone || null, gender: values.gender || null, date_of_birth: values.dateOfBirth || null, gross_salary: values.grossSalary || null, currency_code: values.currency, custom_overtime_rate: values.customOvertimeRate || null, mobile_money_number: values.mobileMoneyNumber || null, bank_name: values.bankName || null, account_number: values.accountNumber || null, sort_code: values.sortCode || null, tin_number: values.tinNumber || null, nssf_number: values.nssfNumber || null, employee_tax_type: values.employeeTaxType, pct_month_worked: values.pctMonthWorked, wht_rate: values.whtRate }, period_data: { start_date: values.startDate, end_date: values.contractEndDate || null, department_id: values.departmentId || null, job_title_id: values.jobTitleId || null, employment_type: values.employmentType, contract_type: values.contractType, probation_end_date: values.probationEndDate || null, probation_status: values.probationStatus } } }
async function create(values: EmployeeFormValues) { const rpc = toEmployeeRpcPayload(values); const { data, error } = await getSupabaseClient().rpc('create_employee_with_period', rpc); if (error) throw error; return get(data as string) }
async function update(id: string, values: EmployeeFormValues) { const rpc = toEmployeeRpcPayload(values); const { error } = await getSupabaseClient().rpc('update_employee_profile', { target_employee_id: id, ...rpc }); if (error) throw error; return get(id) }
async function archive(id: string, reason: string) { const { error } = await getSupabaseClient().rpc('archive_employee', { target_employee_id: id, reason }); if (error) throw error }
async function offboard(id: string, values: OffboardingValues) { const { error } = await getSupabaseClient().rpc('offboard_employee', { target_employee_id: id, last_working_day: values.endDate, reason: values.exitReason, notes: values.exitNotes || null, pay_status: values.finalPayStatus }); if (error) throw error }
export const employeeApi: EmployeeApi = { list, get, setup, create, update, archive, offboard }
