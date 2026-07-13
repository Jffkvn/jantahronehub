import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { inventoryApi } from '../api/inventory'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { ArrowLeft, ShieldAlert, Loader2, AlertCircle } from 'lucide-react'

export function RequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Fetch data
  const requestQuery = useQuery({
    queryKey: ['request', requestId],
    queryFn: async () => {
      if (!requestId) throw new Error('Request ID is required')
      const reqList = await inventoryApi.listRequests()
      const req = reqList.find(r => r.id === requestId)
      if (!req) throw new Error('Stock request not found')
      return req
    }
  })

  const itemsQuery = useQuery({
    queryKey: ['request-items', requestId],
    queryFn: () => {
      if (!requestId) return []
      return inventoryApi.getRequestItems(requestId)
    },
    enabled: !!requestId
  })

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: inventoryApi.listWarehouses
  })

  // Mutations
  const approveMutation = useMutation({
    mutationFn: () => {
      if (!requestId) throw new Error('Request ID is required')
      return inventoryApi.approveRequest(requestId)
    },
    onSuccess: async () => {
      setErrorMsg('')
      setSuccessMsg('Request approved successfully.')
      await queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Approval failed.')
    }
  })

  const escalateMutation = useMutation({
    mutationFn: () => {
      if (!requestId) throw new Error('Request ID is required')
      return inventoryApi.escalateRequest(requestId)
    },
    onSuccess: async () => {
      setErrorMsg('')
      setSuccessMsg('Request escalated to CFO review successfully.')
      await queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Escalation failed.')
    }
  })

  const issueMutation = useMutation({
    mutationFn: () => {
      if (!requestId) throw new Error('Request ID is required')
      return inventoryApi.issueStock(requestId, selectedWarehouseId)
    },
    onSuccess: async () => {
      setErrorMsg('')
      setSuccessMsg('Stock successfully issued (checkout logged).')
      await queryClient.invalidateQueries({ queryKey: ['request', requestId] })
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
      await queryClient.invalidateQueries({ queryKey: ['movements'] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Fulfillment issue failed.')
    }
  })

  if (requestQuery.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
        <Loader2 className="oh-button__spinner" style={{ width: '32px', height: '32px' }} />
        <span>Loading request details...</span>
      </div>
    )
  }

  if (requestQuery.isError || !requestQuery.data) {
    return (
      <div className="oh-alert oh-alert--danger" role="alert">
        <AlertCircle />
        <span>{requestQuery.error instanceof Error ? requestQuery.error.message : 'Error loading details.'}</span>
      </div>
    )
  }

  const req = requestQuery.data
  const items = itemsQuery.data || []

  // Check authorization states
  const hasApprovePermission = permissions.includes('inventory.approve')
  const hasIssuePermission = permissions.includes('inventory.issue')

  // Can approve?
  // - If escalated, requires inventory.approve
  // - If ordinary, requires inventory.approve OR inventory.issue (warehouse manager)
  const canApprove = req.status === 'pending_approval' && (
    req.escalated_to_cfo ? hasApprovePermission : (hasApprovePermission || hasIssuePermission)
  )

  // Can escalate?
  // - If pending_approval and not escalated, anyone with inventory.issue (WM) or inventory.approve can escalate
  const canEscalate = req.status === 'pending_approval' && !req.escalated_to_cfo && (
    hasIssuePermission || hasApprovePermission
  )

  // Can issue?
  // - Approved status, requires inventory.issue
  const canIssue = req.status === 'approved' && hasIssuePermission

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Back button */}
      <div>
        <Link className="oh-back-link" to="/inventory/requests" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={16} /> Back to requests
        </Link>
      </div>

      {/* Detail Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)' }}>
        <div>
          <span className={`oh-badge ${
            req.status === 'fulfilled' ? 'oh-badge--success' :
            req.status === 'approved' ? 'oh-badge--info' :
            req.status === 'pending_approval' ? 'oh-badge--warning' :
            'oh-badge--danger'
          }`} style={{ fontSize: '0.8rem', textTransform: 'capitalize', marginBottom: 'var(--space-2)' }}>
            {req.status.replaceAll('_', ' ')}
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Request: {req.project_name}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
            Requested by: <strong>{req.profiles_requested_by?.display_name || 'Staff'}</strong> · Date: {new Date(req.created_at).toLocaleString()}
          </p>
        </div>

        <div style={{ fontSize: '1.25rem', fontWeight: 800, alignSelf: 'center' }}>
          UGX {req.total_estimated_value.toLocaleString()}
        </div>
      </div>

      {errorMsg && (
        <div className="oh-alert oh-alert--danger" role="alert">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="oh-alert oh-alert--success" role="status">
          {successMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
        
        <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
          {/* Requested Items Table */}
          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-3)' }}>Requisition Items</h3>
            <div className="oh-table-wrap">
              <table className="oh-table">
                <thead>
                  <tr>
                    <th>Item Type</th>
                    <th>Identifier / Name</th>
                    <th>Requested</th>
                    <th>Issued</th>
                    <th>Est. Unit Price</th>
                    <th>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isCon = !!item.consumable_item_id
                    const name = isCon ? item.consumable_items?.name : item.equipment_assets?.model_name
                    const code = isCon ? item.consumable_items?.sku : item.equipment_assets?.serial_number
                    const total = item.quantity * item.estimated_unit_price

                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="oh-badge" style={{ fontSize: '0.75rem' }}>
                            {isCon ? 'Consumable' : 'Equipment'}
                          </span>
                        </td>
                        <td>
                          <strong>{name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{code}</div>
                        </td>
                        <td>{item.quantity}</td>
                        <td>
                          <span className={`oh-badge ${(item.quantity_issued ?? 0) === item.quantity ? 'oh-badge--success' : ''}`}>
                            {item.quantity_issued ?? 0} / {item.quantity}
                          </span>
                        </td>
                        <td>UGX {item.estimated_unit_price.toLocaleString()}</td>
                        <td style={{ fontWeight: 700 }}>UGX {total.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Handlers */}
          {(canApprove || canEscalate || canIssue) && (
            <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface-muted)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-2)' }}>Operations Actions</h3>
              
              {req.status === 'pending_approval' && (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {canApprove && (
                    <Button onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
                      Approve Stock Request
                    </Button>
                  )}
                  {canEscalate && (
                    <Button variant="secondary" onClick={() => escalateMutation.mutate()} loading={escalateMutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <ShieldAlert size={16} /> Escalate to CFO
                    </Button>
                  )}
                </div>
              )}

              {canIssue && (
                <form onSubmit={(e) => { e.preventDefault(); issueMutation.mutate() }} className="oh-form-stack">
                  <p style={{ fontSize: '0.9rem' }}>Fulfill request by handing out assets physically from stock balances.</p>
                  <div>
                    <label className="oh-label">Fulfillment Warehouse</label>
                    <select
                      className="oh-select"
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      required
                    >
                      <option value="">Select source warehouse...</option>
                      {(warehouses.data || []).map((wh) => (
                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" loading={issueMutation.isPending} disabled={!selectedWarehouseId}>
                    Fulfill & Issue Stock
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Status timeline sidebar */}
        <div className="oh-form-stack" style={{ gap: 'var(--space-4)' }}>
          <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 var(--space-4)' }}>Approval Timeline</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'relative', paddingLeft: 'var(--space-4)', borderLeft: '2px solid var(--color-border)' }}>
              
              {/* Point 1: Requisition Created */}
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-23px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-navy-800)' }} />
                <strong>Requisition Logged</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {new Date(req.created_at).toLocaleString()}
                </div>
              </div>

              {/* Point 2: Routing Escalate state */}
              {req.escalated_to_cfo && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-23px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-warning-500)' }} />
                  <strong style={{ color: 'var(--color-warning-700)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    <ShieldAlert size={14} /> CFO Review Escalate
                  </strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Triggered by configurable policy threshold or sensitive asset.
                  </div>
                </div>
              )}

              {/* Point 3: Approved */}
              {(req.status === 'approved' || req.status === 'fulfilled') ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-23px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-success-500)' }} />
                  <strong>Approved</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Approved by: {req.profiles_approved_by?.display_name || 'Staff'}<br/>
                    {req.approved_at ? new Date(req.approved_at).toLocaleString() : ''}
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative', opacity: 0.5 }}>
                  <div style={{ position: 'absolute', left: '-23px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-border)' }} />
                  <span>Awaiting Approval</span>
                </div>
              )}

              {/* Point 4: Fulfilled / Checked out */}
              {req.status === 'fulfilled' ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-23px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-success-600)' }} />
                  <strong>Fulfilled & Issued</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Physical assets checked out from warehouse inventory.
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative', opacity: 0.5 }}>
                  <div style={{ position: 'absolute', left: '-23px', top: '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-border)' }} />
                  <span>Awaiting Stock Checkout</span>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
