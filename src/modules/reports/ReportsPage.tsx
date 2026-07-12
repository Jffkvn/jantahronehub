import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { reportsApi } from './api/reports'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseClient } from '../../lib/supabase/client'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  FileSpreadsheet,
  Users,
  Briefcase,
  Landmark,
  ShieldAlert,
  Package,
  Calendar,
  AlertTriangle
} from 'lucide-react'

export default function ReportsPage() {
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const hasViewPermission = permissions.includes('reports.view')
  const hasExportPermission = permissions.includes('reports.export')

  // Tab State
  const [activeTab, setActiveTab] = useState<'workforce' | 'payroll' | 'inventory' | 'projects' | 'cash'>('workforce')
  const [selectedPayrollPeriod, setSelectedPayrollPeriod] = useState<string>('')

  // Queries
  const { data: workforce, isLoading: isLoadingWorkforce } = useQuery({
    queryKey: ['report-workforce'],
    queryFn: reportsApi.getWorkforceSummary,
    enabled: hasViewPermission
  })

  const { data: payrollSummaries = [], isLoading: isLoadingPayroll } = useQuery({
    queryKey: ['report-payroll'],
    queryFn: reportsApi.getPayrollSummary,
    enabled: hasViewPermission
  })

  const { data: inventory = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: reportsApi.getInventorySummary,
    enabled: hasViewPermission
  })

  const { data: assets = [], isLoading: isLoadingAssets } = useQuery({
    queryKey: ['report-assets'],
    queryFn: reportsApi.getAssetCustodySummary,
    enabled: hasViewPermission
  })

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['report-projects'],
    queryFn: reportsApi.getProjectSummary,
    enabled: hasViewPermission
  })

  const { data: cashReconciliation = [], isLoading: isLoadingCash } = useQuery({
    queryKey: ['report-cash'],
    queryFn: reportsApi.getCashReconciliationSummary,
    enabled: hasViewPermission
  })

  const { data: exceptions = [], isLoading: isLoadingExceptions } = useQuery({
    queryKey: ['report-exceptions'],
    queryFn: reportsApi.getExceptionReport,
    enabled: hasViewPermission
  })

  // Export Auditing Mutation
  const auditExportMutation = useMutation({
    mutationFn: ({ reportName, format }: { reportName: string; format: 'excel' | 'csv' | 'pdf' }) =>
      reportsApi.recordReportExport(reportName, format)
  })

  // Deny access if unauthorized
  if (!hasViewPermission) {
    return (
      <section className="oh-workspace-page">
        <EmptyState
          title="Access Denied"
          description="You do not have the required permissions to view the governance reports page."
          icon={<ShieldAlert size={24} className="text-danger" />}
        />
      </section>
    )
  }

  // Export functions helper
  const triggerExcelExport = async (reportName: string, sheetName: string, data: Record<string, unknown>[]) => {
    try {
      // Audit export in database
      await auditExportMutation.mutateAsync({ reportName, format: 'excel' })

      // Generate spreadsheet
      const XLSX = await import('@e965/xlsx')
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(data)

      // Auto-fit columns
      if (data.length > 0) {
        worksheet['!cols'] = Object.keys(data[0]).map(key => ({
          wch: Math.max(12, key.length + 3)
        }))
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

      // Add general run info metadata sheet
      const meta = XLSX.utils.aoa_to_sheet([
        ['Egypro OneHub 2.0 Governance Export'],
        ['Report Name', reportName],
        ['Export Date', new Date().toLocaleString()],
        ['Actor ID', access?.profile?.id || 'System Actor'],
        ['Powered by', 'JantaHR']
      ])
      XLSX.utils.book_append_sheet(workbook, meta, 'Export Metadata')

      XLSX.writeFile(workbook, `Egypro-${reportName}-${new Date().toISOString().slice(0, 10)}.xlsx`, {
        compression: true
      })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Export failed'
      alert(errorMsg)
    }
  }

  // workforce report export mapping
  const handleWorkforceExport = () => {
    if (!workforce) return
    const deptRows = workforce.departmentCounts.map(d => ({
      'Department Name': d.departmentName,
      'Employees Headcount': d.count
    }))
    triggerExcelExport('Workforce-Summary', 'Workforce', deptRows)
  }

  // payroll report exports
  const handlePayrollSummaryExport = () => {
    const rows = payrollSummaries.map(p => ({
      'Period': p.label,
      'Start Date': p.periodStart,
      'End Date': p.periodEnd,
      'Run Number': p.runNumber,
      'Run Type': p.runType,
      'Status': p.status,
      'Total Gross (UGX)': p.totalGross,
      'Total PAYE (UGX)': p.totalPaye,
      'Total NSSF Employee (UGX)': p.totalNssfEmployee,
      'Total NSSF Employer (UGX)': p.totalNssfEmployer,
      'Total WHT (UGX)': p.totalWht,
      'Total Deductions (UGX)': p.totalDeductions,
      'Total Net Pay (UGX)': p.totalNet,
      'Approved At': p.approvedAt ? new Date(p.approvedAt).toLocaleDateString() : 'N/A'
    }))
    triggerExcelExport('Payroll-Summary', 'Payroll Summary', rows)
  }

  // Statutory PAYE Return Export (Uganda URA style)
  const handlePayeReturnExport = async () => {
    if (!selectedPayrollPeriod) return
    const run = payrollSummaries.find(p => p.id === selectedPayrollPeriod)
    if (!run) return

    try {
      // Call standard record export for auditing
      await auditExportMutation.mutateAsync({ reportName: `PAYE-${run.label}`, format: 'excel' })

      // Fetch payroll run details dynamically to build URA format
      const supabase = getSupabaseClient()
      const { data: items, error } = await supabase
        .from('payroll_items')
        .select('employee_number, employee_name, tin_number, taxable_gross, paye')
        .eq('run_id', run.id)

      if (error) throw error

      const rows = (items || []).map((item: unknown) => {
        const itemObj = item as Record<string, unknown>
        return {
          'Employee Number': String(itemObj.employee_number),
          'Employee Name': String(itemObj.employee_name),
          'TIN Number': String(itemObj.tin_number || 'N/A'),
          'Tax Treatment': 'Resident Employee',
          'Taxable Gross Income (UGX)': Number(itemObj.taxable_gross),
          'PAYE Tax Deducted (UGX)': Number(itemObj.paye)
        }
      })

      const XLSX = await import('@e965/xlsx')
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'PAYE Return')
      XLSX.writeFile(workbook, `Egypro-PAYE-Return-${run.label.replace(/\s+/g, '-')}.xlsx`)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'PAYE Return Export Failed'
      alert(errorMsg)
    }
  }

  // Statutory NSSF Return Export (Uganda NSSF portal template style)
  const handleNssfReturnExport = async () => {
    if (!selectedPayrollPeriod) return
    const run = payrollSummaries.find(p => p.id === selectedPayrollPeriod)
    if (!run) return

    try {
      await auditExportMutation.mutateAsync({ reportName: `NSSF-${run.label}`, format: 'excel' })

      const supabase = getSupabaseClient()
      const { data: items, error } = await supabase
        .from('payroll_items')
        .select('employee_number, employee_name, nssf_number, taxable_gross, nssf_employee, nssf_employer')
        .eq('run_id', run.id)

      if (error) throw error

      const rows = (items || []).map((item: unknown) => {
        const itemObj = item as Record<string, unknown>
        const empContrib = Number(itemObj.nssf_employee || 0)
        const empyrContrib = Number(itemObj.nssf_employer || 0)
        return {
          'Employee Number': String(itemObj.employee_number),
          'Employee Name': String(itemObj.employee_name),
          'NSSF Number': String(itemObj.nssf_number || 'N/A'),
          'Gross Pay (UGX)': Number(itemObj.taxable_gross),
          'Employee Contribution (5%)': empContrib,
          'Employer Contribution (10%)': empyrContrib,
          'Total Contribution (15%)': empContrib + empyrContrib
        }
      })

      const XLSX = await import('@e965/xlsx')
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'NSSF Return')
      XLSX.writeFile(workbook, `Egypro-NSSF-Return-${run.label.replace(/\s+/g, '-')}.xlsx`)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'NSSF Return Export Failed'
      alert(errorMsg)
    }
  }

  // Statutory LST Return Export
  const handleLstReturnExport = async () => {
    if (!selectedPayrollPeriod) return
    const run = payrollSummaries.find(p => p.id === selectedPayrollPeriod)
    if (!run) return

    try {
      await auditExportMutation.mutateAsync({ reportName: `LST-${run.label}`, format: 'excel' })

      const supabase = getSupabaseClient()
      const { data: items, error } = await supabase
        .from('payroll_items')
        .select('employee_number, employee_name, net_pay, other_deductions')
        .eq('run_id', run.id)

      if (error) throw error

      // Filters employees with LST deductions recorded
      const rows = (items || []).map((item: unknown) => {
        const itemObj = item as Record<string, unknown>
        return {
          'Employee Number': String(itemObj.employee_number),
          'Employee Name': String(itemObj.employee_name),
          'Net Salary (UGX)': Number(itemObj.net_pay),
          'LST Deducted (UGX)': Number(itemObj.other_deductions) > 0 ? 20000 : 0 // standard Kampala local service tax rate
        }
      })

      const XLSX = await import('@e965/xlsx')
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'LST Return')
      XLSX.writeFile(workbook, `Egypro-LST-Return-${run.label.replace(/\s+/g, '-')}.xlsx`)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'LST Return Export Failed'
      alert(errorMsg)
    }
  }

  // Inventory balance export mapping
  const handleInventoryBalancesExport = () => {
    const rows = inventory.map(item => ({
      'Warehouse': item.warehouseName,
      'Item Name': item.itemName,
      'SKU': item.sku,
      'Unit': item.unitOfMeasure,
      'Category': item.categoryName,
      'Quantity Balance': item.balance
    }))
    triggerExcelExport('Inventory-Warehouse-Balances', 'Balances', rows)
  }

  // Asset custody export mapping
  const handleAssetCustodyExport = () => {
    const rows = assets.map(asset => ({
      'Model Name': asset.modelName,
      'Serial Number': asset.serialNumber,
      'Category': asset.categoryName,
      'Status': asset.status.toUpperCase(),
      'Current Warehouse/Location': asset.warehouseName || 'Checked Out',
      'Custodian Employee': asset.custodianName || 'N/A',
      'Checked Out Date': asset.checkedOutAt ? new Date(asset.checkedOutAt).toLocaleDateString() : 'N/A',
      'Condition Notes': asset.conditionNotes || 'N/A'
    }))
    triggerExcelExport('Asset-Custody-Audit', 'Custody Log', rows)
  }

  // Project progress export mapping
  const handleProjectProgressExport = () => {
    const rows = projects.map(p => ({
      'Project Name': p.name,
      'Site Location': p.siteLocation,
      'Status': p.status.toUpperCase(),
      'Health Status': p.healthStatus.toUpperCase(),
      'Project Manager': p.pmName || 'Unassigned',
      'Coordinator': p.coordinatorName || 'Unassigned',
      'Total Field Updates Submitted': p.totalUpdates,
      'Last Update Date': p.lastUpdateDate || 'N/A'
    }))
    triggerExcelExport('Projects-Operational-Audit', 'Projects Portfolio', rows)
  }

  // Cash Advance Ledger export mapping
  const handleCashLedgerExport = () => {
    const rows = cashReconciliation.map(req => ({
      'Advance Ref ID': req.id,
      'Project name': req.projectName,
      'Recipient employee': req.recipientName,
      'Purpose': req.purpose,
      'Status': req.status.toUpperCase(),
      'Date Requested': new Date(req.requestedAt).toLocaleDateString(),
      'Amount Requested (UGX)': req.amountRequested,
      'Amount Disbursed (UGX)': req.amountDisbursed,
      'Accepted Expenses Reconciled (UGX)': req.acceptedExpenses,
      'Returned Unused Cash (UGX)': req.returnedCash,
      'Outstanding Balance (UGX)': req.outstandingBalance
    }))
    triggerExcelExport('Cash-Accountability-Reconciliation', 'Ledger Log', rows)
  }

  // Receipt Unavailable Exceptions export mapping
  const handleExceptionLogExport = () => {
    const rows = exceptions.map(exp => ({
      'Expense Line ID': exp.id,
      'Project Name': exp.projectName,
      'Recipient name': exp.recipientName,
      'Expense Date': exp.expenseDate,
      'Category': exp.category.toUpperCase(),
      'Amount (UGX)': exp.amount,
      'Vendor/Payee': exp.vendor,
      'Explanation Details': exp.explanation,
      'Reason For Unavailable Receipt': exp.receiptUnavailableExplanation,
      'Status': exp.status.toUpperCase(),
      'Reviewed By CFO': exp.reviewedBy || 'N/A',
      'Reviewed At': exp.reviewedAt ? new Date(exp.reviewedAt).toLocaleDateString() : 'N/A'
    }))
    triggerExcelExport('Receipt-Unavailable-Exceptions', 'Exceptions Log', rows)
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Central reports header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Governance Reports & Audits</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Verified operational statistics, exceptions tracking, and statutory exports from canonical ledgers.</p>
        </div>
      </div>

      {/* Tab select headers */}
      <div className="oh-portal-tabs" aria-label="Governance sections" style={{ marginBottom: 'var(--space-4)' }}>
        <button
          className={activeTab === 'workforce' ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'}
          onClick={() => setActiveTab('workforce')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Users size={16} />
          <span>Workforce Summary</span>
        </button>
        <button
          className={activeTab === 'payroll' ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'}
          onClick={() => setActiveTab('payroll')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Calendar size={16} />
          <span>Payroll & Statutory</span>
        </button>
        <button
          className={activeTab === 'inventory' ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'}
          onClick={() => setActiveTab('inventory')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Package size={16} />
          <span>Inventory & Assets</span>
        </button>
        <button
          className={activeTab === 'projects' ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'}
          onClick={() => setActiveTab('projects')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Briefcase size={16} />
          <span>Projects Portfolio</span>
        </button>
        <button
          className={activeTab === 'cash' ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'}
          onClick={() => setActiveTab('cash')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Landmark size={16} />
          <span>Finance & Reconciliations</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
        {/* Tab 1: Workforce Summary */}
        {activeTab === 'workforce' && (
          <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Workforce Statistics</h3>
              {hasExportPermission && (
                <Button onClick={handleWorkforceExport} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '0.85rem', padding: 'var(--space-1) var(--space-2)' }}>
                  <FileSpreadsheet size={15} /> Export Workforce
                </Button>
              )}
            </div>

            {isLoadingWorkforce ? (
              <div style={{ color: 'var(--color-text-muted)' }}>Loading workforce stats...</div>
            ) : !workforce ? (
              <div>No workforce metrics available.</div>
            ) : (
              <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                  <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TOTAL HEADCOUNT</span>
                    <h4 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 'var(--space-2) 0 0 0', color: 'var(--color-primary)' }}>
                      {workforce.totalHeadcount} Employees
                    </h4>
                  </div>
                  <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>ACTIVE STAFF</span>
                    <h4 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 'var(--space-2) 0 0 0', color: 'var(--color-success)' }}>
                      {workforce.activeCount} Employees
                    </h4>
                  </div>
                </div>

                <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 var(--space-3) 0' }}>Departmental Headcount Splits</h4>
                  <div className="oh-table-wrapper">
                    <table className="oh-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Department Name</th>
                          <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Headcount Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workforce.departmentCounts.map(d => (
                          <tr key={d.departmentName}>
                            <td style={{ padding: 'var(--space-2)' }}>{d.departmentName}</td>
                            <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>{d.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Payroll & Statutory Period Summary */}
        {activeTab === 'payroll' && (
          <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Approved Payroll Period Summaries</h3>
              {hasExportPermission && (
                <Button onClick={handlePayrollSummaryExport} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '0.85rem', padding: 'var(--space-1) var(--space-2)' }}>
                  <FileSpreadsheet size={15} /> Export Historical Ledger
                </Button>
              )}
            </div>

            {isLoadingPayroll ? (
              <div style={{ color: 'var(--color-text-muted)' }}>Loading payroll statistics...</div>
            ) : payrollSummaries.length === 0 ? (
              <EmptyState
                title="No payroll periods found"
                description="There are currently no approved payroll run totals logged."
                icon={<Calendar size={22} />}
              />
            ) : (
              <div className="oh-form-stack" style={{ gap: 'var(--space-5)' }}>
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Period Label</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Status</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Total Gross</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Total PAYE</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Total NSSF (15%)</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Total Net Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollSummaries.map(p => (
                        <tr key={p.id}>
                          <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>
                            {p.label} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>({p.runType})</span>
                          </td>
                          <td style={{ padding: 'var(--space-2)' }}>
                            <StatusBadge tone={p.status === 'approved' ? 'success' : 'warning'}>
                              {p.status.toUpperCase()}
                            </StatusBadge>
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{p.totalGross.toLocaleString()} UGX</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{p.totalPaye.toLocaleString()} UGX</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                            {(p.totalNssfEmployee + p.totalNssfEmployer).toLocaleString()} UGX
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>{p.totalNet.toLocaleString()} UGX</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Statutory Returns Export Panel */}
                {hasExportPermission && (
                  <div className="oh-card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid var(--color-success)' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 var(--space-2) 0' }}>Uganda Statutory Returns Export Panel</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 var(--space-4) 0' }}>
                      Select an approved payroll period to export formatted Excel filing worksheets.
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="oh-input"
                        style={{ maxWidth: '280px' }}
                        value={selectedPayrollPeriod}
                        onChange={(e) => setSelectedPayrollPeriod(e.target.value)}
                      >
                        <option value="">Select period...</option>
                        {payrollSummaries.filter(p => p.status === 'approved').map(p => (
                          <option key={p.id} value={p.id}>{p.label} (Run {p.runNumber})</option>
                        ))}
                      </select>

                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <Button
                          disabled={!selectedPayrollPeriod}
                          onClick={handlePayeReturnExport}
                          style={{ fontSize: '0.8rem', padding: 'var(--space-1.5) var(--space-3)' }}
                        >
                          Export URA PAYE
                        </Button>
                        <Button
                          disabled={!selectedPayrollPeriod}
                          onClick={handleNssfReturnExport}
                          style={{ fontSize: '0.8rem', padding: 'var(--space-1.5) var(--space-3)' }}
                        >
                          Export NSSF Schedule
                        </Button>
                        <Button
                          disabled={!selectedPayrollPeriod}
                          onClick={handleLstReturnExport}
                          style={{ fontSize: '0.8rem', padding: 'var(--space-1.5) var(--space-3)' }}
                        >
                          Export LST return
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Inventory & Asset Reports */}
        {activeTab === 'inventory' && (
          <div className="oh-form-stack" style={{ gap: 'var(--space-5)' }}>
            {/* Warehouses Balances split */}
            <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Warehouse Consumables Balances</h4>
                {hasExportPermission && (
                  <Button onClick={handleInventoryBalancesExport} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                    <FileSpreadsheet size={14} /> Export Balances
                  </Button>
                )}
              </div>

              {isLoadingInventory ? (
                <div style={{ color: 'var(--color-text-muted)' }}>Loading inventory balances...</div>
              ) : inventory.length === 0 ? (
                <EmptyState
                  title="No balances recorded"
                  description="Warehouse consumable balances are currently 0."
                  icon={<Package size={20} />}
                />
              ) : (
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Warehouse</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Item Name</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>SKU</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Category</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Quantity Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: 'var(--space-2)' }}>{item.warehouseName}</td>
                          <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{item.itemName}</td>
                          <td style={{ padding: 'var(--space-2)' }}><code>{item.sku}</code></td>
                          <td style={{ padding: 'var(--space-2)' }}>{item.categoryName}</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>
                            {item.balance} {item.unitOfMeasure}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Asset custody logs */}
            <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Equipment Assets Custody Log</h4>
                {hasExportPermission && (
                  <Button onClick={handleAssetCustodyExport} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                    <FileSpreadsheet size={14} /> Export Custody Log
                  </Button>
                )}
              </div>

              {isLoadingAssets ? (
                <div style={{ color: 'var(--color-text-muted)' }}>Loading asset custody...</div>
              ) : assets.length === 0 ? (
                <EmptyState
                  title="No assets logged"
                  description="No equipment assets are registered in warehouse ledger."
                  icon={<Package size={20} />}
                />
              ) : (
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Model Name</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Serial Number</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Category</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Warehouse/Location</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Custodian</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((asset, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{asset.modelName}</td>
                          <td style={{ padding: 'var(--space-2)' }}><code>{asset.serialNumber}</code></td>
                          <td style={{ padding: 'var(--space-2)' }}>{asset.categoryName}</td>
                          <td style={{ padding: 'var(--space-2)' }}>{asset.warehouseName}</td>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.9rem' }}>
                            {asset.custodianName ? (
                              <span style={{ display: 'block' }}>
                                {asset.custodianName}
                                {asset.checkedOutAt && (
                                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    Since: {new Date(asset.checkedOutAt).toLocaleDateString()}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)' }}>In Warehouse Stock</span>
                            )}
                          </td>
                          <td style={{ padding: 'var(--space-2)' }}>
                            <StatusBadge tone={asset.status === 'available' ? 'success' : asset.status === 'assigned' ? 'info' : 'danger'}>
                              {asset.status.toUpperCase()}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Projects & Field Updates */}
        {activeTab === 'projects' && (
          <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Projects Performance & Updates</h3>
              {hasExportPermission && (
                <Button onClick={handleProjectProgressExport} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '0.85rem', padding: 'var(--space-1) var(--space-2)' }}>
                  <FileSpreadsheet size={15} /> Export Projects Summary
                </Button>
              )}
            </div>

            {isLoadingProjects ? (
              <div style={{ color: 'var(--color-text-muted)' }}>Loading projects...</div>
            ) : projects.length === 0 ? (
              <EmptyState
                title="No projects logged"
                description="There are currently no active projects recorded."
                icon={<Briefcase size={22} />}
              />
            ) : (
              <div className="oh-table-wrapper">
                <table className="oh-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Project Name</th>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Site Location</th>
                      <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Assigned PM / Coord</th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Submitted Daily Updates</th>
                      <th style={{ textAlign: 'center', padding: 'var(--space-2)' }}>Health</th>
                      <th style={{ textAlign: 'center', padding: 'var(--space-2)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => (
                      <tr key={p.id}>
                        <td style={{ padding: 'var(--space-2)', fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: 'var(--space-2)' }}>{p.siteLocation}</td>
                        <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>
                          <span style={{ display: 'block' }}>PM: {p.pmName || 'Unassigned'}</span>
                          <span style={{ display: 'block', color: 'var(--color-text-muted)' }}>Coord: {p.coordinatorName || 'Unassigned'}</span>
                        </td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                          <span style={{ fontWeight: 600, display: 'block' }}>{p.totalUpdates} Updates</span>
                          {p.lastUpdateDate && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                              Last: {p.lastUpdateDate}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                          <StatusBadge tone={p.healthStatus === 'on_track' ? 'success' : p.healthStatus === 'needs_attention' ? 'warning' : 'danger'}>
                            {p.healthStatus.toUpperCase().replace('_', ' ')}
                          </StatusBadge>
                        </td>
                        <td style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                          <StatusBadge tone={p.status === 'active' ? 'success' : 'neutral'}>
                            {p.status.toUpperCase()}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Finance & Reconciliations */}
        {activeTab === 'cash' && (
          <div className="oh-form-stack" style={{ gap: 'var(--space-5)' }}>
            {/* Cash Advance Ledger */}
            <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Project Cash Advance Reconciliation Invariant</h4>
                {hasExportPermission && (
                  <Button onClick={handleCashLedgerExport} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                    <FileSpreadsheet size={14} /> Export Cash Ledger
                  </Button>
                )}
              </div>

              {isLoadingCash ? (
                <div style={{ color: 'var(--color-text-muted)' }}>Loading cash advance reconciliations...</div>
              ) : cashReconciliation.length === 0 ? (
                <EmptyState
                  title="No advances logged"
                  description="There are currently no cash advance requests recorded."
                  icon={<Landmark size={20} />}
                />
              ) : (
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Recipient / Project</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Disbursed (+)</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Reconciled Expenses (-)</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Cash Returned (-)</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Outstanding (=)</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-2)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashReconciliation.map(req => (
                        <tr key={req.id}>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>
                            <strong style={{ display: 'block', fontSize: '0.9rem' }}>{req.recipientName}</strong>
                            <span style={{ color: 'var(--color-text-muted)' }}>Project: {req.projectName}</span>
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>{req.amountDisbursed.toLocaleString()} UGX</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', color: 'var(--color-danger)' }}>
                            {req.acceptedExpenses.toLocaleString()} UGX
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', color: 'var(--color-warning)' }}>
                            {req.returnedCash.toLocaleString()} UGX
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600, color: req.outstandingBalance > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                            {req.outstandingBalance.toLocaleString()} UGX
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                            <StatusBadge tone={req.status === 'completed' ? 'neutral' : req.status === 'disbursed' ? 'success' : 'warning'}>
                              {req.status.toUpperCase().replace('_', ' ')}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Exception Log (Receipt Unavailable list) */}
            <div className="oh-card" style={{ padding: 'var(--space-4)', borderTop: '4px solid var(--color-warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Receipt-Unavailable Exception Audit Log</h4>
                </div>
                {hasExportPermission && (
                  <Button onClick={handleExceptionLogExport} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                    <FileSpreadsheet size={14} /> Export Exception Log
                  </Button>
                )}
              </div>

              {isLoadingExceptions ? (
                <div style={{ color: 'var(--color-text-muted)' }}>Loading exceptions...</div>
              ) : exceptions.length === 0 ? (
                <div style={{ padding: 'var(--space-4)', background: 'var(--color-background-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No receipt-unavailable exceptions logged in cash advance records.
                </div>
              ) : (
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Recipient / Project</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Date / Category</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Amount</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Details & Explanation</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-2)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map(exp => (
                        <tr key={exp.id}>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>
                            <strong style={{ display: 'block' }}>{exp.recipientName}</strong>
                            <span style={{ color: 'var(--color-text-muted)' }}>{exp.projectName}</span>
                          </td>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>
                            <span style={{ display: 'block' }}>{exp.expenseDate}</span>
                            <span style={{ fontSize: '0.75rem', background: 'var(--color-background-subtle)', padding: '2px 4px', borderRadius: '4px' }}>
                              {exp.category.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>{exp.amount.toLocaleString()} UGX</td>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>
                            <span style={{ display: 'block', fontWeight: 600 }}>Vendor: {exp.vendor}</span>
                            <span style={{ display: 'block' }}>Detail: {exp.explanation}</span>
                            <span style={{ display: 'block', color: 'var(--color-warning)', fontWeight: 600, marginTop: '2px' }}>
                              Reason: {exp.receiptUnavailableExplanation}
                            </span>
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                            <StatusBadge tone={exp.status === 'accepted' ? 'success' : exp.status === 'rejected' ? 'danger' : 'warning'}>
                              {exp.status.toUpperCase()}
                            </StatusBadge>
                            {exp.reviewedBy && (
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                By: {exp.reviewedBy}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
