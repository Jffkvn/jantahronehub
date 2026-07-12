import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { inventoryApi, type InventorySettings } from '../api/inventory'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { ScannerModal } from '../components/ScannerModal'
import { FileSpreadsheet, Camera, Settings, RefreshCw } from 'lucide-react'

export function OverviewPage() {
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const hasManageSettings = permissions.includes('inventory.manage_settings')

  const [scannerOpen, setScannerOpen] = useState(false)
  const [updatingSettings, setUpdatingSettings] = useState(false)

  // Settings values
  const [approvalMode, setApprovalMode] = useState<'warehouse_manager_only' | 'threshold_escalation' | 'cfo_approval_all'>('threshold_escalation')
  const [cfoThreshold, setCfoThreshold] = useState(2000000)
  const [criticalStockEscalation, setCriticalStockEscalation] = useState(false)

  // Fetch metrics
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.listWarehouses })
  const consumables = useQuery({ queryKey: ['consumables'], queryFn: inventoryApi.listConsumables })
  const equipment = useQuery({ queryKey: ['equipment'], queryFn: inventoryApi.listEquipment })
  const requests = useQuery({ queryKey: ['requests'], queryFn: inventoryApi.listRequests })
  const movements = useQuery({ queryKey: ['movements'], queryFn: inventoryApi.listMovements })
  
  const settingsQuery = useQuery<InventorySettings>({
    queryKey: ['inventory-settings'],
    queryFn: inventoryApi.getSettings,
  })

  useEffect(() => {
    if (settingsQuery.data) {
      const { approval_mode, cfo_threshold, critical_stock_escalation } = settingsQuery.data
      const timer = setTimeout(() => {
        setApprovalMode(approval_mode)
        setCfoThreshold(cfo_threshold)
        setCriticalStockEscalation(critical_stock_escalation)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [settingsQuery.data])

  // Update Settings mutation
  const saveSettings = useMutation({
    mutationFn: () => inventoryApi.updateSettings({
      approval_mode: approvalMode,
      cfo_threshold: cfoThreshold,
      critical_stock_escalation: criticalStockEscalation
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-settings'] })
      setUpdatingSettings(false)
    }
  })

  const pendingRequestsCount = (requests.data || []).filter(r => r.status === 'pending_approval').length

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
      queryClient.invalidateQueries({ queryKey: ['consumables'] }),
      queryClient.invalidateQueries({ queryKey: ['equipment'] }),
      queryClient.invalidateQueries({ queryKey: ['requests'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-settings'] })
    ])
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Quick Action Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Warehouse Overview</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Unified inventory operations and logistics management.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={refreshData} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button onClick={() => setScannerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Camera size={15} /> Quick Scan QR
          </Button>
          <Link to="/inventory/bulk-tools">
            <Button variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <FileSpreadsheet size={15} /> Bulk Tools
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Warehouses</small>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 'var(--space-1) 0 0' }}>{warehouses.data?.length ?? 0}</p>
        </div>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Consumable SKUs</small>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 'var(--space-1) 0 0' }}>{consumables.data?.length ?? 0}</p>
        </div>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Active Assets</small>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 'var(--space-1) 0 0' }}>{equipment.data?.length ?? 0}</p>
        </div>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Pending Approvals</small>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, color: pendingRequestsCount > 0 ? 'var(--color-red-600)' : 'inherit', margin: 'var(--space-1) 0 0' }}>{pendingRequestsCount}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        
        {/* Recent Movements Log */}
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-3)' }}>Recent Stock Movements</h3>
          <div className="oh-table-wrap">
            <table className="oh-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Warehouse</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {(movements.data || []).slice(0, 6).map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(m.created_at).toLocaleString()}</td>
                    <td>
                      <span className={`oh-badge ${m.movement_type === 'receipt' || m.movement_type === 'adjustment_add' ? 'oh-badge--success' : 'oh-badge--warning'}`} style={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>
                        {m.movement_type.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td>{m.warehouses?.name || '—'}</td>
                    <td>{m.consumable_items?.name || m.equipment_assets?.model_name || 'Asset'}</td>
                    <td style={{ fontWeight: 700 }}>{m.quantity}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-navy-600)' }}>{m.reference_id}</td>
                  </tr>
                ))}
                {(!movements.data || movements.data.length === 0) && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
          {/* Active Warehouses List */}
          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-3)' }}>Warehouses</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {(warehouses.data || []).map((wh) => (
                <div key={wh.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <strong>{wh.name}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{wh.location || 'Kampala'}</div>
                  </div>
                  <span className="oh-badge" style={{ fontSize: '0.7rem' }}>{wh.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Configurable Settings Panel */}
          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <Settings size={16} /> Routing Settings
              </h3>
              {hasManageSettings && !updatingSettings && (
                <Button variant="ghost" onClick={() => setUpdatingSettings(true)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
                  Edit
                </Button>
              )}
            </div>

            {settingsQuery.isLoading ? (
              <p>Loading routing configuration...</p>
            ) : updatingSettings ? (
              <form onSubmit={(e) => { e.preventDefault(); saveSettings.mutate() }} className="oh-form-stack">
                <div>
                  <label className="oh-label">Approval Mode</label>
                  <select
                    className="oh-select"
                    value={approvalMode}
                    onChange={(e) => setApprovalMode(e.target.value as 'warehouse_manager_only' | 'threshold_escalation' | 'cfo_approval_all')}
                  >
                    <option value="warehouse_manager_only">Warehouse Manager Only</option>
                    <option value="threshold_escalation">Threshold/Item Escalation</option>
                    <option value="cfo_approval_all">CFO Approval All</option>
                  </select>
                </div>
                {approvalMode === 'threshold_escalation' && (
                  <>
                    <div>
                      <label className="oh-label">CFO Threshold (UGX)</label>
                      <input
                        type="number"
                        className="oh-input"
                        value={cfoThreshold}
                        onChange={(e) => setCfoThreshold(Number(e.target.value))}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="checkbox"
                        id="critEsc"
                        checked={criticalStockEscalation}
                        onChange={(e) => setCriticalStockEscalation(e.target.checked)}
                      />
                      <label htmlFor="critEsc" className="oh-label" style={{ margin: 0 }}>Escalate on Critical Stock Depletion</label>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <Button type="submit" loading={saveSettings.isPending} style={{ flex: 1 }}>Save</Button>
                  <Button variant="secondary" onClick={() => setUpdatingSettings(false)} style={{ flex: 1 }}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="oh-form-stack" style={{ fontSize: '0.9rem', gap: 'var(--space-2)' }}>
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>Approval Mode: </span>
                  <strong>{settingsQuery.data?.approval_mode.replaceAll('_', ' ')}</strong>
                </div>
                {settingsQuery.data?.approval_mode === 'threshold_escalation' && (
                  <>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>CFO Threshold: </span>
                      <strong>UGX {(settingsQuery.data?.cfo_threshold || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Critical Stock Escalation: </span>
                      <strong>{settingsQuery.data?.critical_stock_escalation ? 'Enabled' : 'Disabled'}</strong>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Scanner modal */}
      <ScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onActionCompleted={refreshData} />
    </div>
  )
}
