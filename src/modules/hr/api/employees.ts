import { getSupabaseClient } from '../../../lib/supabase/client'
import type { EmployeeFormValues, OffboardingValues } from '../schemas/employee'

export interface EmployeeSummary {
  id: string
  employeeNumber: string
  legalName: string
  preferredName: string | null
  companyEmail: string | null
  workPhone: string | null
  active: boolean
  departmentName: string | null
  jobTitleName: string | null
  startDate: string | null
  endDate: string | null
}

export interface EmployeeApi {
  list(): Promise<EmployeeSummary[]>
  get(id: string): Promise<EmployeeSummary>
  create(values: EmployeeFormValues): Promise<EmployeeSummary>
  update(id: string, values: EmployeeFormValues): Promise<EmployeeSummary>
  archive(id: string, reason: string): Promise<void>
  offboard(id: string, values: OffboardingValues): Promise<void>
}

type EmployeeRow = {
  id: string
  employee_number: string
  legal_name: string
  preferred_name: string | null
  company_email: string | null
  work_phone: string | null
  archived_at: string | null
  employment_periods?: Array<{
    start_date: string
    end_date: string | null
    departments: { name: string } | null
    job_titles: { name: string } | null
  }>
}

const employeeSelection = `
  id, employee_number, legal_name, preferred_name, company_email, work_phone, archived_at,
  employment_periods(start_date, end_date, departments(name), job_titles(name))
`

function mapEmployee(row: EmployeeRow): EmployeeSummary {
  const periods = [...(row.employment_periods ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date))
  const current = periods.find((period) => !period.end_date || period.end_date >= new Date().toISOString().slice(0, 10)) ?? periods[0]
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    legalName: row.legal_name,
    preferredName: row.preferred_name,
    companyEmail: row.company_email,
    workPhone: row.work_phone,
    active: !row.archived_at && Boolean(current && (!current.end_date || current.end_date >= new Date().toISOString().slice(0, 10))),
    departmentName: current?.departments?.name ?? null,
    jobTitleName: current?.job_titles?.name ?? null,
    startDate: current?.start_date ?? null,
    endDate: current?.end_date ?? null,
  }
}

async function list() {
  const { data, error } = await getSupabaseClient()
    .from('employees')
    .select(employeeSelection)
    .is('archived_at', null)
    .order('legal_name')
  if (error) throw error
  return (data as unknown as EmployeeRow[]).map(mapEmployee)
}

async function get(id: string) {
  const { data, error } = await getSupabaseClient()
    .from('employees')
    .select(employeeSelection)
    .eq('id', id)
    .single()
  if (error) throw error
  return mapEmployee(data as unknown as EmployeeRow)
}

async function create(values: EmployeeFormValues) {
  const { data, error } = await getSupabaseClient().rpc('create_employee_with_period', {
    employee_data: {
      employee_number: values.employeeNumber,
      legal_name: values.legalName,
      preferred_name: values.preferredName || null,
      company_email: values.companyEmail || null,
      work_phone: values.workPhone || null,
    },
    period_data: {
      start_date: values.startDate,
      employment_type: values.employmentType,
      contract_type: values.contractType,
    },
  })
  if (error) throw error
  return get(data as string)
}

async function update(id: string, values: EmployeeFormValues) {
  const { error } = await getSupabaseClient().rpc('update_employee_profile', {
    target_employee_id: id,
    employee_data: {
      employee_number: values.employeeNumber,
      legal_name: values.legalName,
      preferred_name: values.preferredName || null,
      company_email: values.companyEmail || null,
      work_phone: values.workPhone || null,
    },
  })
  if (error) throw error
  return get(id)
}

async function archive(id: string, reason: string) {
  const { error } = await getSupabaseClient().rpc('archive_employee', {
    target_employee_id: id,
    reason,
  })
  if (error) throw error
}

async function offboard(id: string, values: OffboardingValues) {
  const { error } = await getSupabaseClient().rpc('offboard_employee', {
    target_employee_id: id,
    last_working_day: values.endDate,
    reason: values.exitReason,
    notes: values.exitNotes || null,
    pay_status: values.finalPayStatus,
  })
  if (error) throw error
}

export const employeeApi: EmployeeApi = { list, get, create, update, archive, offboard }
