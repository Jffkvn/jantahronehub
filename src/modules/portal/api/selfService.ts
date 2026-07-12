import { getSupabaseClient } from '../../../lib/supabase/client'
import { createPrivateDownloadUrl } from '../../../lib/security/privateFiles'
import { mapPayrollRun } from '../../payroll/api/payroll'
import type { PayrollRun } from '../../payroll/types'

type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'intern' | 'contractor'
type ContractType = 'permanent' | 'fixed_term' | 'casual' | 'internship' | 'consultancy'
type ProbationStatus = 'not_applicable' | 'on_probation' | 'passed' | 'extended' | 'failed'

export interface SelfServiceProfile {
  id: string
  employeeNumber: string
  legalName: string
  companyEmail: string | null
  personalEmail: string | null
  workPhone: string | null
  active: boolean
  departmentName: string | null
  jobTitleName: string | null
  startDate: string | null
  endDate: string | null
  employmentType: EmploymentType | null
  contractType: ContractType | null
  probationEndDate: string | null
  probationStatus: ProbationStatus | null
}

export interface SelfServiceDocument {
  id: string
  displayName: string
  documentType: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  storagePath: string
}

export interface SelfServiceApi {
  getProfile(): Promise<SelfServiceProfile | null>
  listDocuments(): Promise<SelfServiceDocument[]>
  createDocumentDownload(document: SelfServiceDocument): Promise<string>
  listPayslips(): Promise<PayrollRun[]>
  downloadPayslip(run: PayrollRun): Promise<void>
}

type PeriodRow = {
  start_date: string
  end_date: string | null
  employment_type: EmploymentType
  contract_type: ContractType
  probation_end_date: string | null
  probation_status: ProbationStatus
  departments: { name: string } | null
  job_titles: { name: string } | null
}

type EmployeeRow = {
  id: string
  employee_number: string
  legal_name: string
  company_email: string | null
  personal_email: string | null
  work_phone: string | null
  archived_at: string | null
  employment_periods?: PeriodRow[]
}

type DocumentRow = {
  id: string
  display_name: string
  document_type: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
  storage_path: string
}

const profileSelection = `id, employee_number, legal_name, company_email, personal_email, work_phone, archived_at, employment_periods(start_date, end_date, employment_type, contract_type, probation_end_date, probation_status, departments(name), job_titles(name))`
const documentSelection =
  'id, display_name, document_type, mime_type, size_bytes, uploaded_at, storage_path'

function currentPeriod(periods: PeriodRow[] = []) {
  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date))
  return sorted.find((period) => !period.end_date || period.end_date >= today) ?? sorted[0]
}

function mapProfile(row: EmployeeRow): SelfServiceProfile {
  const period = currentPeriod(row.employment_periods)
  const today = new Date().toISOString().slice(0, 10)

  return {
    id: row.id,
    employeeNumber: row.employee_number,
    legalName: row.legal_name,
    companyEmail: row.company_email,
    personalEmail: row.personal_email,
    workPhone: row.work_phone,
    active: !row.archived_at && Boolean(period && (!period.end_date || period.end_date >= today)),
    departmentName: period?.departments?.name ?? null,
    jobTitleName: period?.job_titles?.name ?? null,
    startDate: period?.start_date ?? null,
    endDate: period?.end_date ?? null,
    employmentType: period?.employment_type ?? null,
    contractType: period?.contract_type ?? null,
    probationEndDate: period?.probation_end_date ?? null,
    probationStatus: period?.probation_status ?? null,
  }
}

function mapDocument(row: DocumentRow): SelfServiceDocument {
  return {
    id: row.id,
    displayName: row.display_name,
    documentType: row.document_type,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    storagePath: row.storage_path,
  }
}

async function currentUserId() {
  const { data, error } = await getSupabaseClient().auth.getSession()
  if (error) throw error
  return data.session?.user.id ?? null
}

async function getProfile() {
  const userId = await currentUserId()
  if (!userId) return null

  const { data, error } = await getSupabaseClient()
    .from('employees')
    .select(profileSelection)
    .eq('profile_id', userId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw error
  return data ? mapProfile(data as unknown as EmployeeRow) : null
}

async function listDocuments() {
  const profile = await getProfile()
  if (!profile) return []

  const { data, error } = await getSupabaseClient()
    .from('employee_documents')
    .select(documentSelection)
    .eq('employee_id', profile.id)
    .eq('employee_visible', true)
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })

  if (error) throw error
  return (data as unknown as DocumentRow[]).map(mapDocument)
}

async function createDocumentDownload(document: SelfServiceDocument) {
  const supabaseUrl = new URL(import.meta.env.VITE_SUPABASE_URL)
  return createPrivateDownloadUrl(document.storagePath, {
    allowedOrigin: supabaseUrl.origin,
    createSignedUrl: (path, expiresIn) =>
      getSupabaseClient().storage.from('private-files').createSignedUrl(path, expiresIn),
  })
}

async function listPayslips() {
  const { data, error } = await getSupabaseClient().rpc('get_my_payslips')
  if (error) throw error
  return ((data ?? []) as Array<{ payload: Record<string, unknown> }>).map((row) => mapPayrollRun(row.payload))
}

async function downloadPayslip(run: PayrollRun) {
  const item = run.items[0]
  if (!item) throw new Error('Payslip data is unavailable')
  const { error } = await getSupabaseClient().rpc('record_payroll_export', { target_run_id: run.id, target_item_id: item.id, export_kind: 'payslip' })
  if (error) throw error
  const { downloadPayslip: downloadPayslipPdf } = await import('../../payroll/exports/payslip')
  await downloadPayslipPdf(run, item)
}

export const selfServiceApi: SelfServiceApi = {
  getProfile,
  listDocuments,
  createDocumentDownload,
  listPayslips,
  downloadPayslip,
}
