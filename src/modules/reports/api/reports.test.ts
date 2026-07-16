import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportsApi } from './reports'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  from: vi.fn(),
  rpc: vi.fn()
}))

vi.mock('../../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({ from: state.from, rpc: state.rpc })
}))

function query(rows: Row[]) {
  let result = [...rows]
  const builder = {
    select: vi.fn(() => builder),
    is: vi.fn((column: string, value: unknown) => {
      result = result.filter((row) => row[column] === value)
      return builder
    }),
    eq: vi.fn((column: string, value: unknown) => {
      result = result.filter((row) => row[column] === value)
      return builder
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      result = result.filter((row) => values.includes(row[column]))
      return builder
    }),
    order: vi.fn(() => builder),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: result, error: null }).then(resolve)
  }
  return builder
}

beforeEach(() => {
  state.tables = {}
  state.from.mockReset()
  state.rpc.mockReset()
  state.from.mockImplementation((table: string) => query(state.tables[table] ?? []))
})

describe('reportsApi', () => {
  it('loads the curated governance snapshot through the protected RPC', async () => {
    const snapshot = {
      workforce: { totalHeadcount: 8, activeCount: 7, departmentCounts: [] },
      payrollSummaries: [],
      inventory: [],
      assets: [],
      projects: [],
      cashReconciliation: [],
      exceptions: []
    }
    state.rpc.mockResolvedValue({ data: snapshot, error: null })

    await expect(reportsApi.getGovernanceSnapshot()).resolves.toEqual(snapshot)
    expect(state.rpc).toHaveBeenCalledWith('get_governance_report_snapshot')
    expect(state.from).not.toHaveBeenCalled()
  })

  it('uses signed stock movements so issues reduce the reported balance', async () => {
    state.tables.consumable_items = [{
      id: 'item-1',
      name: 'Cable',
      sku: 'CBL-1',
      unit_of_measure: 'roll',
      item_categories: { name: 'Electrical' }
    }]
    state.tables.stock_movements = [
      {
        movement_type: 'receipt',
        quantity: 10,
        consumable_item_id: 'item-1',
        warehouses: { name: 'Main Warehouse' }
      },
      {
        movement_type: 'issue',
        quantity: -4,
        consumable_item_id: 'item-1',
        warehouses: { name: 'Main Warehouse' }
      }
    ]

    await expect(reportsApi.getInventorySummary()).resolves.toEqual([
      expect.objectContaining({ balance: 6 })
    ])
  })

  it('counts only employees with a current employment period as active', async () => {
    state.tables.employees = [
      {
        id: 'active',
        archived_at: null,
        employment_periods: [{
          start_date: '2026-01-01',
          end_date: null,
          department_id: 'dept-1',
          departments: { name: 'Operations' }
        }]
      },
      {
        id: 'ended',
        archived_at: null,
        employment_periods: [{
          start_date: '2025-01-01',
          end_date: '2025-12-31',
          department_id: 'dept-1',
          departments: { name: 'Operations' }
        }]
      }
    ]

    await expect(reportsApi.getWorkforceSummary()).resolves.toEqual({
      totalHeadcount: 2,
      activeCount: 1,
      departmentCounts: [{ departmentName: 'Operations', count: 1 }]
    })
  })

  it('uses the active custody record instead of the warehouse issuer', async () => {
    state.tables.equipment_assets = [{
      id: 'asset-1',
      serial_number: 'GEN-001',
      model_name: 'Generator',
      status: 'assigned',
      condition_notes: 'Good',
      item_categories: { name: 'Power' },
      warehouses: null
    }]
    state.tables.stock_movements = [{
      equipment_asset_id: 'asset-1',
      created_at: '2026-07-01T08:00:00Z',
      profiles_performed_by: { display_name: 'Warehouse Issuer' }
    }]
    state.tables.asset_custody = [{
      equipment_asset_id: 'asset-1',
      issued_at: '2026-07-01T08:00:00Z',
      profiles_custodian: { display_name: 'Field Custodian' },
      warehouses_issued_from: { name: 'Main Warehouse' },
      ended_at: null
    }]

    await expect(reportsApi.getAssetCustodySummary()).resolves.toEqual([
      expect.objectContaining({
        custodianName: 'Field Custodian',
        checkedOutAt: '2026-07-01T08:00:00Z'
      })
    ])
  })

  it('maps pm assignments and includes submitted and endorsed daily updates', async () => {
    state.tables.projects = [{
      id: 'project-1',
      name: 'Solar Installation',
      site_location: 'Kampala',
      status: 'active',
      health_status: 'on_track',
      project_assignments: [
        { role_on_project: 'pm', profiles: { display_name: 'Project Manager' } },
        { role_on_project: 'coordinator', profiles: { display_name: 'Coordinator' } }
      ]
    }]
    state.tables.daily_updates = [
      { project_id: 'project-1', update_date: '2026-07-01', status: 'submitted' },
      { project_id: 'project-1', update_date: '2026-07-02', status: 'endorsed' },
      { project_id: 'project-1', update_date: '2026-07-03', status: 'draft' }
    ]

    await expect(reportsApi.getProjectSummary()).resolves.toEqual([
      expect.objectContaining({
        pmName: 'Project Manager',
        coordinatorName: 'Coordinator',
        totalUpdates: 2,
        lastUpdateDate: '2026-07-02'
      })
    ])
  })

  it('does not relabel miscellaneous deductions as LST', async () => {
    const module = await import('./reports') as unknown as {
      buildVerifiedLstExportRows: (items: Row[]) => Row[]
    }

    const rows = module.buildVerifiedLstExportRows([
      {
        employee_number: 'EGY-001',
        employee_name: 'Example Employee',
        net_pay: 980000,
        other_deductions: 20000,
        payroll_line_items: [{ kind: 'deduction', code: 'OTHER_1', amount: 20000 }]
      }
    ])

    expect(rows).toEqual([])
  })
})
