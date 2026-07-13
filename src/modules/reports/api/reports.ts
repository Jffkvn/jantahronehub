import { getSupabaseClient } from '../../../lib/supabase/client'

export interface WorkforceSummary {
  totalHeadcount: number
  activeCount: number
  departmentCounts: Array<{ departmentName: string; count: number }>
}

export interface PayrollPeriodSummaryItem {
  id: string
  label: string
  periodStart: string
  periodEnd: string
  runNumber: number
  runType: string
  status: string
  totalGross: number
  totalPaye: number
  totalNssfEmployee: number
  totalNssfEmployer: number
  totalWht: number
  totalDeductions: number
  totalNet: number
  approvedAt: string | null
}

export interface InventoryBalanceSummary {
  warehouseName: string
  itemName: string
  sku: string
  unitOfMeasure: string
  categoryName: string
  balance: number
}

export interface AssetCustodySummary {
  serialNumber: string
  modelName: string
  categoryName: string
  status: string
  custodianName: string | null
  checkedOutAt: string | null
  warehouseName: string | null
  conditionNotes: string | null
}

export interface ProjectReportSummary {
  id: string
  name: string
  siteLocation: string
  status: string
  pmName: string | null
  coordinatorName: string | null
  healthStatus: string
  totalUpdates: number
  lastUpdateDate: string | null
}

export interface CashReconciliationSummary {
  id: string
  projectName: string
  recipientName: string
  purpose: string
  status: string
  requestedAt: string
  amountRequested: number
  amountDisbursed: number
  acceptedExpenses: number
  returnedCash: number
  outstandingBalance: number
}

export interface ReceiptExceptionSummary {
  id: string
  advanceId: string
  projectName: string
  recipientName: string
  expenseDate: string
  category: string
  amount: number
  vendor: string
  explanation: string
  receiptUnavailableExplanation: string
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
}

// Database query interfaces
interface DBDepartmentRelation {
  name: string
}
interface DBPeriodRow {
  department_id: string | null
  start_date: string
  end_date: string | null
  departments: DBDepartmentRelation | DBDepartmentRelation[] | null
}
interface DBEmployeeRow {
  id: string
  archived_at: string | null
  employment_periods: DBPeriodRow[] | null
}

interface DBPayrollPeriodRelation {
  id: string
  label: string
  period_start: string
  period_end: string
}
interface DBPayrollRunRow {
  id: string
  run_number: number
  run_type: string
  status: string
  approved_at: string | null
  total_gross: number
  total_paye: number
  total_nssf_employee: number
  total_nssf_employer: number
  total_wht: number
  total_deductions: number
  total_net: number
  payroll_periods: DBPayrollPeriodRelation | DBPayrollPeriodRelation[] | null
}

interface DBConsumableItem {
  id: string
  name: string
  sku: string
  unit_of_measure: string
  item_categories: { name: string } | { name: string }[] | null
}
interface DBStockMovement {
  movement_type: string
  quantity: number
  consumable_item_id: string | null
  warehouses: { name: string } | { name: string }[] | null
}

interface DBAssetRow {
  id: string
  serial_number: string
  model_name: string
  status: string
  condition_notes: string | null
  item_categories: { name: string } | { name: string }[] | null
  warehouses: { name: string } | { name: string }[] | null
}
interface DBAssetCustody {
  equipment_asset_id: string | null
  issued_at: string
  profiles_custodian: { display_name: string } | { display_name: string }[] | null
  warehouses_issued_from: { name: string } | { name: string }[] | null
}

interface DBProjectRow {
  id: string
  name: string
  site_location: string
  status: string
  health_status: string
  project_assignments: {
    role_on_project: string
    profiles: { display_name: string } | { display_name: string }[] | null
  }[] | null
}

interface LstPayrollLine {
  kind?: unknown
  code?: unknown
  amount?: unknown
}

export interface LstPayrollItem {
  employee_number?: unknown
  employee_name?: unknown
  net_pay?: unknown
  payroll_line_items?: unknown
}

export function buildVerifiedLstExportRows(items: LstPayrollItem[]): Record<string, unknown>[] {
  return items.flatMap((item) => {
    const lines = Array.isArray(item.payroll_line_items)
      ? item.payroll_line_items as LstPayrollLine[]
      : []
    const lstDeduction = lines
      .filter((line) => line.kind === 'deduction' && String(line.code || '').trim().toUpperCase() === 'LST')
      .reduce((sum, line) => sum + Number(line.amount || 0), 0)

    if (lstDeduction <= 0) return []

    return [{
      'Employee Number': String(item.employee_number || ''),
      'Employee Name': String(item.employee_name || ''),
      'Net Salary (UGX)': Number(item.net_pay || 0),
      'LST Deducted (UGX)': lstDeduction
    }]
  })
}

interface DBCashRequest {
  id: string
  purpose: string
  status: string
  requested_at: string
  amount_requested: number
  amount_disbursed: number | null
  projects: { name: string } | { name: string }[] | null
  profiles_user: { display_name: string } | { display_name: string }[] | null
}

interface DBExceptionRow {
  id: string
  cash_advance_id: string
  expense_date: string
  category: string
  amount: number
  vendor: string
  explanation: string
  receipt_unavailable_explanation: string | null
  status: string
  reviewed_at: string | null
  profiles_reviewed_by: { display_name: string } | { display_name: string }[] | null
  cash_advance_requests: {
    projects: { name: string } | { name: string }[] | null
    profiles_user: { display_name: string } | { display_name: string }[] | null
  } | {
    projects: { name: string } | { name: string }[] | null
    profiles_user: { display_name: string } | { display_name: string }[] | null
  }[] | null
}

export const reportsApi = {
  recordReportExport: async (reportName: string, format: 'excel' | 'csv' | 'pdf'): Promise<void> => {
    const { error } = await getSupabaseClient().rpc('record_report_export', {
      p_report_name: reportName,
      p_format: format
    })
    if (error) throw error
  },

  getWorkforceSummary: async (): Promise<WorkforceSummary> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('employees')
      .select('id, archived_at, employment_periods(department_id, start_date, end_date, departments(name))')
      .is('archived_at', null)

    if (error) throw error

    const employees = data as unknown as DBEmployeeRow[]
    let totalHeadcount = 0
    let activeCount = 0
    const deptMap = new Map<string, number>()
    const today = new Date().toISOString().slice(0, 10)

    for (const emp of (employees || [])) {
      totalHeadcount++

      const periods = emp.employment_periods || []
      const currentPeriod = [...periods]
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .find((period) => period.start_date <= today && (!period.end_date || period.end_date >= today))

      if (currentPeriod) {
        activeCount++
        const deptRelation = currentPeriod.departments
        const deptName = (Array.isArray(deptRelation) ? deptRelation[0]?.name : deptRelation?.name) || 'Unassigned'
        deptMap.set(deptName, (deptMap.get(deptName) || 0) + 1)
      }
    }

    const departmentCounts = Array.from(deptMap.entries()).map(([departmentName, count]) => ({
      departmentName,
      count
    }))

    return {
      totalHeadcount,
      activeCount,
      departmentCounts
    }
  },

  getPayrollSummary: async (): Promise<PayrollPeriodSummaryItem[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('payroll_runs')
      .select(`
        id, run_number, run_type, status, approved_at,
        total_gross, total_paye, total_nssf_employee, total_nssf_employer, total_wht, total_deductions, total_net,
        payroll_periods (id, label, period_start, period_end)
      `)
      .order('approved_at', { ascending: false, nullsFirst: false })

    if (error) throw error

    const runs = data as unknown as DBPayrollRunRow[]

    return (runs || []).map((row) => {
      const period = Array.isArray(row.payroll_periods) ? row.payroll_periods[0] : row.payroll_periods
      return {
        id: row.id,
        label: period?.label || 'Unknown Period',
        periodStart: period?.period_start || '',
        periodEnd: period?.period_end || '',
        runNumber: Number(row.run_number || 0),
        runType: row.run_type || '',
        status: row.status || '',
        totalGross: Number(row.total_gross || 0),
        totalPaye: Number(row.total_paye || 0),
        totalNssfEmployee: Number(row.total_nssf_employee || 0),
        totalNssfEmployer: Number(row.total_nssf_employer || 0),
        totalWht: Number(row.total_wht || 0),
        totalDeductions: Number(row.total_deductions || 0),
        totalNet: Number(row.total_net || 0),
        approvedAt: row.approved_at
      }
    })
  },

  getInventorySummary: async (): Promise<InventoryBalanceSummary[]> => {
    const supabase = getSupabaseClient()
    const { data: itemsData, error: itemsError } = await supabase
      .from('consumable_items')
      .select('id, name, sku, unit_of_measure, item_categories(name)')

    if (itemsError) throw itemsError

    const { data: movementsData, error: movementsError } = await supabase
      .from('stock_movements')
      .select('movement_type, quantity, consumable_item_id, warehouses(name)')

    if (movementsError) throw movementsError

    const items = itemsData as unknown as DBConsumableItem[]
    const movements = movementsData as unknown as DBStockMovement[]
    const balancesMap = new Map<string, InventoryBalanceSummary>()

    for (const item of (items || [])) {
      const catRelation = item.item_categories
      const catName = (Array.isArray(catRelation) ? catRelation[0]?.name : catRelation?.name) || 'General'

      for (const m of (movements || [])) {
        const whRelation = m.warehouses
        const mWarehouseName = (Array.isArray(whRelation) ? whRelation[0]?.name : whRelation?.name) || ''
        if (m.consumable_item_id === item.id && mWarehouseName) {
          const key = `${mWarehouseName}_${item.id}`
          const qtyChange = Number(m.quantity)

          const existing = balancesMap.get(key)
          if (existing) {
            existing.balance += qtyChange
          } else {
            balancesMap.set(key, {
              warehouseName: mWarehouseName,
              itemName: item.name,
              sku: item.sku,
              unitOfMeasure: item.unit_of_measure,
              categoryName: catName,
              balance: qtyChange
            })
          }
        }
      }
    }

    return Array.from(balancesMap.values()).filter(b => b.balance > 0)
  },

  getAssetCustodySummary: async (): Promise<AssetCustodySummary[]> => {
    const supabase = getSupabaseClient()
    const { data: assetsData, error } = await supabase
      .from('equipment_assets')
      .select(`
        id, serial_number, model_name, status, condition_notes,
        item_categories (name),
        warehouses:current_warehouse_id (name)
      `)
      .order('model_name')

    if (error) throw error

    const { data: custodyData, error: custodyError } = await supabase
      .from('asset_custody')
      .select(`
        equipment_asset_id, issued_at,
        profiles_custodian:profiles!custodian_profile_id (display_name),
        warehouses_issued_from:warehouses!issued_from_warehouse_id (name)
      `)
      .is('ended_at', null)
      .order('issued_at', { ascending: false })

    if (custodyError) throw custodyError

    const assets = assetsData as unknown as DBAssetRow[]
    const custody = custodyData as unknown as DBAssetCustody[]

    return (assets || []).map((asset) => {
      const activeCustody = custody?.find((row) => row.equipment_asset_id === asset.id)

      const catRelation = asset.item_categories
      const assetCategoryName = (Array.isArray(catRelation) ? catRelation[0]?.name : catRelation?.name) || 'General'

      const whRelation = asset.warehouses
      const issuedFromRelation = activeCustody?.warehouses_issued_from
      const assetWarehouseName = activeCustody
        ? (Array.isArray(issuedFromRelation) ? issuedFromRelation[0]?.name : issuedFromRelation?.name) || 'Checked Out'
        : (Array.isArray(whRelation) ? whRelation[0]?.name : whRelation?.name) || null

      const profRelation = activeCustody?.profiles_custodian
      const assetCustodianName = activeCustody
        ? (Array.isArray(profRelation) ? profRelation[0]?.display_name : profRelation?.display_name) || null
        : null

      return {
        serialNumber: asset.serial_number,
        modelName: asset.model_name,
        categoryName: assetCategoryName,
        status: asset.status,
        custodianName: assetCustodianName,
        checkedOutAt: activeCustody?.issued_at || null,
        warehouseName: assetWarehouseName,
        conditionNotes: asset.condition_notes
      }
    })
  },

  getProjectSummary: async (): Promise<ProjectReportSummary[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, name, site_location, status, health_status,
        project_assignments (role_on_project, profiles (display_name))
      `)
      .order('name')

    if (error) throw error

    const { data: updates, error: updatesError } = await supabase
      .from('daily_updates')
      .select('project_id, update_date')
      .in('status', ['submitted', 'endorsed'])

    if (updatesError) throw updatesError

    const projects = data as unknown as DBProjectRow[]

    return (projects || []).map((p) => {
      const pUpdates = updates?.filter(u => u.project_id === p.id) || []
      const assignments = p.project_assignments || []

      const pmAssign = assignments.find((a) => a.role_on_project === 'pm')
      const pmProf = pmAssign?.profiles
      const pm = (Array.isArray(pmProf) ? pmProf[0]?.display_name : pmProf?.display_name) || null

      const coordAssign = assignments.find((a) => a.role_on_project === 'coordinator')
      const coordProf = coordAssign?.profiles
      const coord = (Array.isArray(coordProf) ? coordProf[0]?.display_name : coordProf?.display_name) || null

      const dates = pUpdates.map(u => u.update_date).sort()

      return {
        id: p.id,
        name: p.name,
        siteLocation: p.site_location,
        status: p.status,
        pmName: pm,
        coordinatorName: coord,
        healthStatus: p.health_status,
        totalUpdates: pUpdates.length,
        lastUpdateDate: dates[dates.length - 1] || null
      }
    })
  },

  getCashReconciliationSummary: async (): Promise<CashReconciliationSummary[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('cash_advance_requests')
      .select(`
        id, purpose, status, requested_at, amount_requested, amount_disbursed,
        projects (name),
        profiles_user: user_id (display_name)
      `)
      .order('requested_at', { ascending: false })

    if (error) throw error

    const { data: expenses, error: expError } = await supabase
      .from('cash_advance_expenses')
      .select('cash_advance_id, amount')
      .eq('status', 'accepted')

    if (expError) throw expError

    const { data: returns, error: retError } = await supabase
      .from('cash_advance_returns')
      .select('cash_advance_id, amount')

    if (retError) throw retError

    const requests = data as unknown as DBCashRequest[]

    return (requests || []).map((req) => {
      const reqExpenses = expenses?.filter(e => e.cash_advance_id === req.id) || []
      const acceptedExpenses = reqExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

      const reqReturns = returns?.filter(r => r.cash_advance_id === req.id) || []
      const returnedCash = reqReturns.reduce((sum, r) => sum + Number(r.amount), 0)

      const amountDisbursed = Number(req.amount_disbursed || 0)
      const outstandingBalance = amountDisbursed - acceptedExpenses - returnedCash

      const projRelation = req.projects
      const projectName = (Array.isArray(projRelation) ? projRelation[0]?.name : projRelation?.name) || 'Unknown'

      const userRelation = req.profiles_user
      const recipientName = (Array.isArray(userRelation) ? userRelation[0]?.display_name : userRelation?.display_name) || 'System User'

      return {
        id: req.id,
        projectName,
        recipientName,
        purpose: req.purpose,
        status: req.status,
        requestedAt: req.requested_at,
        amountRequested: Number(req.amount_requested),
        amountDisbursed,
        acceptedExpenses,
        returnedCash,
        outstandingBalance
      }
    })
  },

  getExceptionReport: async (): Promise<ReceiptExceptionSummary[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('cash_advance_expenses')
      .select(`
        id, cash_advance_id, expense_date, category, amount, vendor, explanation,
        receipt_unavailable_explanation, status, reviewed_at,
        profiles_reviewed_by: reviewed_by (display_name),
        cash_advance_requests: cash_advance_id (
          projects (name),
          profiles_user: user_id (display_name)
        )
      `)
      .eq('receipt_unavailable', true)
      .order('expense_date', { ascending: false })

    if (error) throw error

    const exceptions = data as unknown as DBExceptionRow[]

    return (exceptions || []).map((row) => {
      const reviewerRelation = row.profiles_reviewed_by
      const reviewedBy = (Array.isArray(reviewerRelation) ? reviewerRelation[0]?.display_name : reviewerRelation?.display_name) || null

      const reqRelation = row.cash_advance_requests
      const req = Array.isArray(reqRelation) ? reqRelation[0] : reqRelation

      const projRelation = req?.projects
      const projectName = (Array.isArray(projRelation) ? projRelation[0]?.name : projRelation?.name) || 'Unknown'

      const userRelation = req?.profiles_user
      const recipientName = (Array.isArray(userRelation) ? userRelation[0]?.display_name : userRelation?.display_name) || 'System User'

      return {
        id: row.id,
        advanceId: row.cash_advance_id,
        projectName,
        recipientName,
        expenseDate: row.expense_date,
        category: row.category,
        amount: Number(row.amount),
        vendor: row.vendor,
        explanation: row.explanation,
        receiptUnavailableExplanation: row.receipt_unavailable_explanation || '',
        status: row.status,
        reviewedBy,
        reviewedAt: row.reviewed_at
      }
    })
  }
}
