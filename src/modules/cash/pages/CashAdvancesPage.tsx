import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cashApi, type CashAdvanceRequest } from '../api/cash'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Plus, Landmark, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react'

export function CashAdvancesPage() {
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const currentUserId = access?.profile?.id
  const isCfo = permissions.includes('cash_advances.manage')

  // UI States
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [recipientUserId, setRecipientUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [formError, setFormError] = useState('')

  // Queries
  const { data: requests = [], isLoading: isLoadingRequests, refetch } = useQuery<CashAdvanceRequest[]>({
    queryKey: ['cash-requests'],
    queryFn: cashApi.getRequests
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['cash-projects'],
    queryFn: cashApi.getActiveProjects
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['cash-profiles'],
    queryFn: cashApi.getActiveProfiles,
    enabled: isCfo
  })

  // Outstanding warning query
  const { data: hasOutstanding = false } = useQuery({
    queryKey: ['outstanding-warning', recipientUserId],
    queryFn: () => cashApi.checkOutstandingAdvances(recipientUserId),
    enabled: !!recipientUserId
  })


  // Mutation to request advance
  const requestMutation = useMutation({
    mutationFn: () => {
      const numAmount = Number(amount)
      return cashApi.requestAdvance(projectId, recipientUserId, numAmount, purpose)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-requests'] })
      setProjectId('')
      setRecipientUserId(currentUserId || '')
      setAmount('')
      setPurpose('')
      setRequestModalOpen(false)
      setFormError('')
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to submit cash request.')
    }
  })

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) {
      setFormError('Project is required')
      return
    }
    if (!recipientUserId) {
      setFormError('Recipient profile is required')
      return
    }
    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Amount must be a positive number')
      return
    }
    if (!purpose.trim()) {
      setFormError('Purpose description is required')
      return
    }

    requestMutation.mutate()
  }

  // Aggregate stats
  const totalDisbursed = requests
    .filter(r => r.status === 'disbursed' || r.status === 'completed')
    .reduce((sum, r) => sum + Number(r.amount_disbursed || 0), 0)

  const pendingCount = requests.filter(r => r.status === 'pending_approval').length
  const activeCount = requests.filter(r => r.status === 'disbursed').length

  const getStatusTone = (status: string): StatusTone => {
    switch (status) {
      case 'pending_approval': return 'warning'
      case 'approved': return 'info'
      case 'disbursed': return 'success'
      case 'completed': return 'neutral'
      case 'rejected': return 'danger'
      default: return 'neutral'
    }
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Project Cash Advances</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Request operational funds, track disbursements, and submit expense reconciliation.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => void refetch()} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button onClick={() => { setRecipientUserId(currentUserId || ''); setRequestModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Plus size={16} /> Request Advance
          </Button>
        </div>
      </div>

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TOTAL DISBURSED FUNDS</span>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 'var(--space-2) 0 0 0', color: 'var(--color-primary)' }}>
            {totalDisbursed.toLocaleString()} UGX
          </h3>
        </div>
        <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>PENDING APPROVAL</span>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 'var(--space-2) 0 0 0', color: 'var(--color-warning)' }}>
            {pendingCount} Requests
          </h3>
        </div>
        <div className="oh-card" style={{ padding: 'var(--space-4)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>ACTIVE DISBURSEMENTS</span>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 'var(--space-2) 0 0 0', color: 'var(--color-success)' }}>
            {activeCount} Advances
          </h3>
        </div>
      </div>

      {/* Requests portfolio list */}
      {isLoadingRequests ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading cash advance requests...
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          title="No cash advances logged"
          description="There are currently no cash advance requests recorded."
          icon={<Landmark size={22} />}
          action={
            <Button onClick={() => { setRecipientUserId(currentUserId || ''); setRequestModalOpen(true); }}>
              <Plus size={16} /> Request Cash Advance
            </Button>
          }
        />
      ) : (
        <div className="oh-table-wrapper">
          <table className="oh-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Date Requested</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Recipient</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Project Name</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-3)' }}>Requested / Disbursed</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Purpose</th>
                <th style={{ textAlign: 'center', padding: 'var(--space-3)' }}>Status</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-3)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td style={{ padding: 'var(--space-3)' }}>
                    {new Date(req.requested_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td style={{ padding: 'var(--space-3)' }}>{req.profiles_user?.display_name || 'System User'}</td>
                  <td style={{ padding: 'var(--space-3)' }}>{req.projects?.name}</td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600 }}>{req.amount_requested.toLocaleString()} UGX</span>
                    {req.amount_disbursed && (
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-success)' }}>
                        Disbursed: {req.amount_disbursed.toLocaleString()} UGX
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 'var(--space-3)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {req.purpose}
                  </td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <StatusBadge tone={getStatusTone(req.status)}>
                      {req.status.toUpperCase().replace('_', ' ')}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                    <Link to={`${req.id}`}>
                      <Button variant="secondary" style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        Details <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Request Advance Modal */}
      <Modal open={requestModalOpen} title="Request Project Cash Advance" onClose={() => setRequestModalOpen(false)}>
        <form onSubmit={handleRequestSubmit} className="oh-form-stack">
          {formError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* Project dropdown */}
          <div className="oh-field">
            <label className="oh-field__label">Target Project</label>
            <select
              className="oh-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
            >
              <option value="">Select project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Recipient dropdown (CFO only, for coordinators it is read-only own profile) */}
          <div className="oh-field">
            <label className="oh-field__label">Recipient Employee</label>
            {isCfo ? (
              <select
                className="oh-input"
                value={recipientUserId}
                onChange={(e) => setRecipientUserId(e.target.value)}
                required
              >
                <option value="">Select recipient...</option>
                {profiles.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.display_name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="oh-input"
                value={access?.profile?.displayName || ''}
                disabled
                style={{ background: 'var(--color-background-subtle)' }}
              />
            )}
          </div>

          {/* Outstanding warning flag */}
          {hasOutstanding && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-warning-surface)', color: 'var(--color-warning)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'start', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block' }}>Outstanding Advance Warning</strong>
                <span style={{ fontSize: '0.85rem' }}>This employee has unresolved active cash advances. CFO review and approval override reason will be required to disburse.</span>
              </div>
            </div>
          )}

          {/* Amount Requested */}
          <Input
            label="Amount Requested (UGX)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="e.g. 1500000"
          />

          {/* Purpose description */}
          <div className="oh-field">
            <label className="oh-field__label">Operational Purpose</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              placeholder="Provide a detailed explanation of items or activities to be funded..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setRequestModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={requestMutation.isPending}>
              {requestMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
