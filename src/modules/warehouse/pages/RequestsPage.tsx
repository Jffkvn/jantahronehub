import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { inventoryApi } from '../api/inventory'
import { projectsApi } from '../../projects/api/projects'
import { Button } from '../../../components/ui/Button'
import { Combobox } from '../../../components/ui/Combobox'
import { Modal } from '../../../components/ui/Modal'
import { Plus, Trash2, ArrowRight } from 'lucide-react'

export function RequestsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  
  // New request modal state
  const [creating, setCreating] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [itemsList, setItemsList] = useState<Array<{
    consumable_item_id: string | null
    equipment_asset_id: string | null
    quantity: number
    displayName: string
    expected_return_date: string | null
  }>>([])
  
  // Add item form state
  const [itemType, setItemType] = useState<'consumable' | 'equipment'>('consumable')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [qty, setQty] = useState(1)
  const [searchParams] = useSearchParams()
  const [expectedReturnDate, setExpectedReturnDate] = useState('')

  const [errorMsg, setErrorMsg] = useState('')

  // Fetch data
  const requests = useQuery({ queryKey: ['requests'], queryFn: inventoryApi.listRequests })
  const consumables = useQuery({ queryKey: ['consumables'], queryFn: inventoryApi.listConsumables })
  const equipment = useQuery({ queryKey: ['equipment'], queryFn: inventoryApi.listEquipment })
  const projects = useQuery({ queryKey: ['projects', 'inventory-request-options'], queryFn: projectsApi.getProjects })

  // Mutations
  const createRequest = useMutation({
    mutationFn: () => {
      const itemsPayload = itemsList.map(item => ({
        consumable_item_id: item.consumable_item_id,
        equipment_asset_id: item.equipment_asset_id,
        quantity: item.quantity,
        expected_return_date: item.expected_return_date,
      }))
      return inventoryApi.requestStock(projectId!, itemsPayload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['requests'] })
      setCreating(false)
      resetForm()
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Request creation failed.')
    }
  })

  const resetForm = () => {
    setProjectId(null)
    setItemsList([])
    setSelectedItemId('')
    setQty(1)
    setExpectedReturnDate('')
    setErrorMsg('')
  }

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItemId) return

    let displayName = ''
    let consumableId: string | null = null
    let equipmentId: string | null = null

    if (itemType === 'consumable') {
      const item = consumables.data?.find(c => c.id === selectedItemId)
      if (item) {
        displayName = `${item.name} (${item.sku})`
        consumableId = item.id
      }
    } else {
      const asset = equipment.data?.find(e => e.id === selectedItemId)
      if (asset) {
        displayName = `${asset.model_name} (${asset.serial_number})`
        equipmentId = asset.id
      }
    }

    if (!displayName) return

    setItemsList([
      ...itemsList,
      {
        consumable_item_id: consumableId,
        equipment_asset_id: equipmentId,
        quantity: qty,
        displayName,
        expected_return_date: itemType === 'equipment' ? expectedReturnDate || null : null,
      }
    ])

    setSelectedItemId('')
    setQty(1)
    setExpectedReturnDate('')
  }

  const handleRemoveItem = (index: number) => {
    setItemsList(itemsList.filter((_, i) => i !== index))
  }

  const filteredRequests = useMemo(() => {
    let list = requests.data || []
    const needle = search.trim().toLowerCase()

    if (needle) {
      list = list.filter(r => 
        r.project_name.toLowerCase().includes(needle) || 
        r.profiles_requested_by?.display_name?.toLowerCase().includes(needle)
      )
    }

    const activeStatus = selectedStatus || searchParams.get('status') || ''
    if (activeStatus) {
      list = list.filter(r => r.status === activeStatus)
    }

    return list
  }, [requests.data, search, selectedStatus, searchParams])

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Stock & Requisition Requests</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Log project requests, view CFO approvals, and issue warehouse assets.</p>
        </div>
        <Button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <Plus size={16} /> Create Stock Request
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', background: 'var(--color-surface-muted)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="oh-input"
            placeholder="Search by project name or requester..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
            aria-label="Search requests"
          />
        </div>
        <select
          className="oh-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          style={{ width: '180px' }}
        >
          <option value="">All Statuses</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Requests Table Grid */}
      <div className="oh-table-wrap">
        <table className="oh-table">
          <thead>
            <tr>
              <th>Date Requested</th>
              <th>Project Name</th>
              <th>Requested By</th>
              <th>Estimated Value</th>
              <th>CFO Escalated</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((req) => (
              <tr key={req.id}>
                <td style={{ fontSize: '0.85rem' }}>{new Date(req.created_at).toLocaleString()}</td>
                <td><strong>{req.project_name}</strong></td>
                <td><strong>{req.requester_name || req.profiles_requested_by?.display_name || 'Unknown team member'}</strong><br /><span className="oh-table-subtext">{req.requester_role || 'Team member'}</span></td>
                <td style={{ fontWeight: 700 }}>UGX {req.total_estimated_value.toLocaleString()}</td>
                <td>
                  {req.escalated_to_cfo ? (
                    <span className="oh-badge oh-badge--warning">CFO Approval Required</span>
                  ) : (
                    <span className="oh-badge" style={{ color: 'var(--color-text-muted)' }}>Warehouse Level</span>
                  )}
                </td>
                <td>
                  <span className={`oh-badge ${
                    req.status === 'fulfilled' ? 'oh-badge--success' :
                    req.status === 'approved' ? 'oh-badge--info' :
                    req.status === 'pending_approval' ? 'oh-badge--warning' :
                    'oh-badge--danger'
                  }`} style={{ textTransform: 'capitalize' }}>
                    {req.status.replaceAll('_', ' ')}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Link to={`/inventory/requests/${req.id}`}>
                    <Button variant="ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      Details <ArrowRight size={13} />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
                  No stock requests recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Request Modal */}
      <Modal open={creating} title="Create Project Stock Request" onClose={() => { setCreating(false); resetForm() }}>
        <div className="oh-form-stack">
          {errorMsg && (
            <div className="oh-alert oh-alert--danger" role="alert">
              {errorMsg}
            </div>
          )}
          <Combobox
            label="Project"
            options={(projects.data || []).map((project) => ({
              value: project.id,
              label: `${project.project_code || 'Project'} · ${project.name}`,
              description: project.site_location || undefined,
              disabled: !['planned', 'active', 'on_hold'].includes(project.status),
            }))}
            value={projectId}
            onChange={setProjectId}
            placeholder="Search project code or name"
            emptyMessage="No assigned operational projects found"
            required
          />

          <div style={{ border: '1px solid var(--color-border)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-muted)' }}>
            <h4 style={{ margin: '0 0 var(--space-3)', fontWeight: 700 }}>Add Requisition Items</h4>
            
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
              <select
                className="oh-select"
                value={itemType}
                onChange={(e) => { setItemType(e.target.value as 'consumable' | 'equipment'); setSelectedItemId('') }}
                style={{ width: '130px' }}
              >
                <option value="consumable">Consumable</option>
                <option value="equipment">Equipment</option>
              </select>

              <select
                className="oh-select"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                style={{ flex: 1, minWidth: '180px' }}
              >
                <option value="">Select item...</option>
                {itemType === 'consumable' ? (
                  (consumables.data || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>
                  ))
                ) : (
                  (equipment.data || [])
                    .filter((e) => e.status === 'available')
                    .map((e) => (
                      <option key={e.id} value={e.id}>{e.model_name} (S/N: {e.serial_number})</option>
                    ))
                )}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <div style={{ flex: 1 }}>
                <label className="oh-label" style={{ fontSize: '0.75rem' }}>Qty</label>
                <input
                  type="number"
                  className="oh-input"
                  min={1}
                  disabled={itemType === 'equipment'}
                  value={itemType === 'equipment' ? 1 : qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </div>
              {itemType === 'equipment' ? (
                <div style={{ flex: 2 }}>
                  <label className="oh-label" style={{ fontSize: '0.75rem' }} htmlFor="request-expected-return">Expected return</label>
                  <input
                    id="request-expected-return"
                    type="date"
                    className="oh-input"
                    value={expectedReturnDate}
                    onChange={(event) => setExpectedReturnDate(event.target.value)}
                  />
                </div>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button variant="secondary" onClick={handleAddItem} disabled={!selectedItemId}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Items Preview Table */}
          {itemsList.length > 0 && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <h4 style={{ margin: '0 0 var(--space-2)', fontWeight: 700 }}>Requested Items Summary</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {itemsList.map((item, index) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
                    <div>
                      <strong>{item.displayName}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Qty: {item.quantity} · Value and approval routing are calculated from warehouse receipts
                        {item.expected_return_date ? ` · Return by ${item.expected_return_date}` : ''}
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => handleRemoveItem(index)} style={{ padding: '0.2rem', color: 'var(--color-red-600)' }}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Button
              onClick={() => createRequest.mutate()}
              loading={createRequest.isPending}
              disabled={!projectId || itemsList.length === 0}
              style={{ flex: 1 }}
            >
              Submit Request
            </Button>
            <Button variant="secondary" onClick={() => { setCreating(false); resetForm() }} style={{ flex: 1 }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
