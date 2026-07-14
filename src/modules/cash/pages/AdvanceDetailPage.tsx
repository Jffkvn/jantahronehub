import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cashApi, type CashAdvanceRequest, type CashAdvanceExpense, type CashAdvanceReturn } from '../api/cash'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { BackLink } from '../../../components/ui/BackLink'
import { toSafeExternalUrl } from '../../../lib/security/safeUrl'
import { ArrowLeft, AlertTriangle, Check, X, FileText, Image, Landmark } from 'lucide-react'

export function AdvanceDetailPage() {
  const { advanceId } = useParams<{ advanceId: string }>()
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const currentUserId = access?.profile?.id
  const isCfo = permissions.includes('cash_advances.manage')

  // UI States
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [disburseModalOpen, setDisburseModalOpen] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [returnModalOpen, setReturnModalOpen] = useState(false)

  const [overrideReason, setOverrideReason] = useState('')
  const [disburseAmount, setDisburseAmount] = useState('')
  const [disburseRef, setDisburseRef] = useState('')

  // Expense Form States
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [category, setCategory] = useState('transport')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [explanation, setExplanation] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptUnavailable, setReceiptUnavailable] = useState(false)
  const [receiptUnavailableExplanation, setReceiptUnavailableExplanation] = useState('')

  // Return Form States
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [returnAmount, setReturnAmount] = useState('')
  const [returnRef, setReturnRef] = useState('')
  const [returnNotes, setReturnNotes] = useState('')

  // Review states
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewExpenseId, setReviewExpenseId] = useState('')
  const [acceptExpense, setAcceptExpense] = useState(true)
  const [rejectionReason, setRejectionReason] = useState('')

  // Action error states
  const [actionError, setActionError] = useState('')

  // Queries
  const { data: request, isLoading: isLoadingRequest } = useQuery<CashAdvanceRequest | null>({
    queryKey: ['cash-request', advanceId],
    queryFn: () => cashApi.getRequest(advanceId!),
    enabled: !!advanceId
  })

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery<CashAdvanceExpense[]>({
    queryKey: ['cash-expenses', advanceId],
    queryFn: () => cashApi.getExpenses(advanceId!),
    enabled: !!advanceId
  })

  const { data: returns = [], isLoading: isLoadingReturns } = useQuery<CashAdvanceReturn[]>({
    queryKey: ['cash-returns', advanceId],
    queryFn: () => cashApi.getReturns(advanceId!),
    enabled: !!advanceId
  })

  const { data: outstandingBalance = 0 } = useQuery<number>({
    queryKey: ['cash-balance', advanceId],
    queryFn: () => cashApi.getBalance(advanceId!),
    enabled: !!advanceId
  })

  const { data: hasOutstanding = false } = useQuery({
    queryKey: ['outstanding-warning-pm', request?.user_id],
    queryFn: () => cashApi.checkOutstandingAdvances(request!.user_id),
    enabled: !!request?.user_id && request?.status === 'pending_approval'
  })

  // Mutations
  const approveMutation = useMutation({
    mutationFn: () => cashApi.approveAdvance(advanceId!, hasOutstanding ? overrideReason : null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-request', advanceId] })
      setApproveModalOpen(false)
      setOverrideReason('')
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to approve cash request.')
    }
  })

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const supabase = (await import('../../../lib/supabase/client')).getSupabaseClient()
      const { error } = await supabase
        .from('cash_advance_requests')
        .update({ status: 'rejected', closed_by: currentUserId, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', advanceId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-request', advanceId] })
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to reject cash request.')
    }
  })

  const disburseMutation = useMutation({
    mutationFn: () => {
      const numAmount = Number(disburseAmount)
      return cashApi.disburseAdvance(advanceId!, numAmount, disburseRef)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-request', advanceId] })
      queryClient.invalidateQueries({ queryKey: ['cash-balance', advanceId] })
      queryClient.invalidateQueries({ queryKey: ['cash-requests'] })
      setDisburseModalOpen(false)
      setDisburseAmount('')
      setDisburseRef('')
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to disburse funds.')
    }
  })

  const submitExpenseMutation = useMutation({
    mutationFn: () => {
      const numAmount = Number(expenseAmount)
      return cashApi.submitExpense(
        advanceId!,
        expenseDate,
        category,
        numAmount,
        vendor,
        explanation,
        receiptUrl || null,
        receiptUnavailable,
        receiptUnavailable ? receiptUnavailableExplanation : null
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-expenses', advanceId] })
      queryClient.invalidateQueries({ queryKey: ['cash-balance', advanceId] })
      setExpenseModalOpen(false)
      setExpenseAmount('')
      setVendor('')
      setExplanation('')
      setReceiptUrl('')
      setReceiptUnavailable(false)
      setReceiptUnavailableExplanation('')
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to submit expense log.')
    }
  })

  const reviewExpenseMutation = useMutation({
    mutationFn: () => cashApi.reviewExpense(reviewExpenseId, acceptExpense, acceptExpense ? null : rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-expenses', advanceId] })
      queryClient.invalidateQueries({ queryKey: ['cash-balance', advanceId] })
      setReviewModalOpen(false)
      setReviewExpenseId('')
      setRejectionReason('')
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to review expense item.')
    }
  })

  const recordReturnMutation = useMutation({
    mutationFn: () => {
      const numAmount = Number(returnAmount)
      return cashApi.recordReturn(advanceId!, returnDate, numAmount, returnRef, returnNotes || null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-returns', advanceId] })
      queryClient.invalidateQueries({ queryKey: ['cash-balance', advanceId] })
      setReturnModalOpen(false)
      setReturnAmount('')
      setReturnRef('')
      setReturnNotes('')
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to record return.')
    }
  })

  const closeMutation = useMutation({
    mutationFn: () => cashApi.closeAdvance(advanceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-request', advanceId] })
      queryClient.invalidateQueries({ queryKey: ['cash-requests'] })
      setActionError('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to close advance.')
    }
  })

  if (isLoadingRequest) {
    return <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>Loading advance details...</div>
  }

  if (!request) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <EmptyState
          title="Advance not found"
          description="The requested cash advance request profile was not found in the database."
          icon={<AlertTriangle size={22} />}
        />
        <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
          <Link to="/cash/advances">
            <Button variant="secondary">
              <ArrowLeft size={16} /> Back to Advances
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const isOwner = request.user_id === currentUserId
  const isPending = request.status === 'pending_approval'
  const isApproved = request.status === 'approved'
  const isDisbursed = request.status === 'disbursed'
  const isCompleted = request.status === 'completed'

  // Accepted expenses total
  const acceptedExpensesTotal = expenses
    .filter(e => e.status === 'accepted')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  // Returns total
  const returnedCashTotal = returns.reduce((sum, r) => sum + Number(r.amount), 0)

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

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(expenseAmount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setActionError('Expense amount must be a positive number')
      return
    }
    if (!vendor.trim()) {
      setActionError('Vendor is required')
      return
    }
    if (!explanation.trim()) {
      setActionError('Explanation is required')
      return
    }
    if (receiptUnavailable && (!receiptUnavailableExplanation || !receiptUnavailableExplanation.trim())) {
      setActionError('Explanation is required for receipt-unavailable expenses')
      return
    }

    submitExpenseMutation.mutate()
  }

  const handleReturnSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = Number(returnAmount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setActionError('Return amount must be a positive number')
      return
    }
    if (!returnRef.trim()) {
      setActionError('Receipt reference is required')
      return
    }

    recordReturnMutation.mutate()
  }

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!acceptExpense && (!rejectionReason || !rejectionReason.trim())) {
      setActionError('Rejection reason is required when declining an expense')
      return
    }
    reviewExpenseMutation.mutate()
  }

  return (
    <section className="oh-workspace-page">
      {/* Detail Header */}
      <BackLink to="/cash/advances">Cash advances</BackLink>
      <header className="oh-page-header">
        <div>
          <p>Project cash accountability</p>
          <h1>Advance accountability</h1>
          <span>
            Ref: <code>{request.id.slice(0, 8)}</code> · Requested by {request.profiles_user?.display_name}
          </span>
        </div>
        <StatusBadge tone={getStatusTone(request.status)}>
          {request.status.toUpperCase().replace('_', ' ')}
        </StatusBadge>
      </header>

      {actionError && (
        <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AlertTriangle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Reconciliation Box */}
      {isDisbursed && (
        <section className="oh-kpi-band" aria-label="Cash reconciliation">
          <article className="oh-kpi"><span className="oh-kpi__label">Disbursed funds (+)</span><strong className="oh-kpi__value">{Number(request.amount_disbursed || 0).toLocaleString()} UGX</strong></article>
          <article className="oh-kpi"><span className="oh-kpi__label">Accepted expenses (-)</span><strong className="oh-kpi__value">{acceptedExpensesTotal.toLocaleString()} UGX</strong></article>
          <article className="oh-kpi"><span className="oh-kpi__label">Cash returned (-)</span><strong className="oh-kpi__value oh-kpi__value--warning">{returnedCashTotal.toLocaleString()} UGX</strong></article>
          <article className="oh-kpi"><span className="oh-kpi__label">Outstanding balance (=)</span><strong className={`oh-kpi__value ${outstandingBalance > 0 ? 'oh-kpi__value--danger' : 'oh-kpi__value--success'}`}>{outstandingBalance.toLocaleString()} UGX</strong></article>
        </section>
      )}

      {/* Main details splits */}
      <div className="oh-operational-split">
        <div className="oh-form-stack">
          {/* General info details */}
          <section className="oh-section-surface">
            <div className="oh-section-header"><div><h2>Request profile</h2><p>Original request and approval context.</p></div></div>
            <div className="oh-dossier-grid">
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Project</span>
                <p style={{ fontWeight: 600, margin: '4px 0 0 0' }}>{request.projects?.name}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Amount Requested</span>
                <p style={{ fontWeight: 600, margin: '4px 0 0 0' }}>{request.amount_requested.toLocaleString()} UGX</p>
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Purpose</span>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>{request.purpose}</p>
            </div>

            {request.override_reason && (
              <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-warning-surface)', color: 'var(--color-warning)', borderRadius: 'var(--radius-md)' }}>
                <strong style={{ fontSize: '0.85rem', display: 'block' }}>CFO Warning Override Reason:</strong>
                <span style={{ fontSize: '0.85rem' }}>{request.override_reason}</span>
              </div>
            )}
          </section>

          {/* Expenses section (only active if disbursed or completed) */}
          {(isDisbursed || isCompleted) && (
            <section className="oh-section-surface">
              <div className="oh-section-header">
                <div><h2>Expense ledger</h2><p>Submitted expenditure and receipt review.</p></div>
                {isDisbursed && isOwner && (
                  <Button onClick={() => setExpenseModalOpen(true)} style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.85rem' }}>
                    Log Expense
                  </Button>
                )}
              </div>

              {isLoadingExpenses ? (
                <div style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading expense details...</div>
              ) : expenses.length === 0 ? (
                <EmptyState
                  title="No expenses logged"
                  description="Submit receipts or expense line items for this advance."
                  icon={<FileText size={20} />}
                />
              ) : (
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Vendor</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Category</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Amount</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Details / Receipt</th>
                        <th style={{ textAlign: 'center', padding: 'var(--space-2)' }}>Status</th>
                        {isDisbursed && isCfo && <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(exp => (
                        <tr key={exp.id}>
                          <td style={{ padding: 'var(--space-2)' }}>{exp.expense_date}</td>
                          <td style={{ padding: 'var(--space-2)' }}>{exp.vendor}</td>
                          <td style={{ padding: 'var(--space-2)' }}>
                            <span style={{ fontSize: '0.8rem', background: 'var(--color-background-subtle)', padding: '2px 6px', borderRadius: '4px' }}>
                              {exp.category.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>
                            {exp.amount.toLocaleString()} UGX
                          </td>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>
                            <span style={{ display: 'block' }}>{exp.explanation}</span>
                            {exp.receipt_unavailable ? (
                              <span style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                <AlertTriangle size={12} /> RECEIPT UNAVAILABLE: {exp.receipt_unavailable_explanation}
                              </span>
                            ) : (
                              exp.receipt_url && toSafeExternalUrl(exp.receipt_url) && (
                                <a href={toSafeExternalUrl(exp.receipt_url) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                  <Image size={12} /> View Receipt
                                </a>
                              )
                            )}
                          </td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                            <StatusBadge tone={exp.status === 'accepted' ? 'success' : exp.status === 'rejected' ? 'danger' : 'warning'}>
                              {exp.status.toUpperCase()}
                            </StatusBadge>
                            {exp.status === 'rejected' && exp.rejection_reason && (
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: '2px' }}>
                                Reason: {exp.rejection_reason}
                              </span>
                            )}
                          </td>
                          {isDisbursed && isCfo && (
                            <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                              {exp.status === 'pending_review' && (
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setReviewExpenseId(exp.id)
                                      setAcceptExpense(true)
                                      setReviewModalOpen(true)
                                    }}
                                    style={{ padding: '2px 6px', background: 'var(--color-success-surface)', color: 'var(--color-success)', border: 'none' }}
                                  >
                                    <Check size={14} />
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setReviewExpenseId(exp.id)
                                      setAcceptExpense(false)
                                      setReviewModalOpen(true)
                                    }}
                                    style={{ padding: '2px 6px', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', border: 'none' }}
                                  >
                                    <X size={14} />
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Cash Returns section (only active if disbursed or completed) */}
          {(isDisbursed || isCompleted) && (
            <section className="oh-section-surface">
              <div className="oh-section-header">
                <div><h2>Returned cash ledger</h2><p>Cash returned against this advance.</p></div>
                {isDisbursed && isCfo && (
                  <Button onClick={() => setReturnModalOpen(true)} style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.85rem' }}>
                    Record Return
                  </Button>
                )}
              </div>

              {isLoadingReturns ? (
                <div style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading returned cash...</div>
              ) : returns.length === 0 ? (
                <EmptyState
                  title="No returns logged"
                  description="Log cash returns to the CFO to reconcile the advance."
                  icon={<Landmark size={20} />}
                />
              ) : (
                <div className="oh-table-wrapper">
                  <table className="oh-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Ref / Receipt</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Returned By</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Received By</th>
                        <th style={{ textAlign: 'right', padding: 'var(--space-2)' }}>Amount</th>
                        <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returns.map(ret => (
                        <tr key={ret.id}>
                          <td style={{ padding: 'var(--space-2)' }}>{ret.return_date}</td>
                          <td style={{ padding: 'var(--space-2)' }}><code>{ret.receipt_reference}</code></td>
                          <td style={{ padding: 'var(--space-2)' }}>{ret.profiles_returned_by?.display_name || 'Coordinator'}</td>
                          <td style={{ padding: 'var(--space-2)' }}>{ret.profiles_received_by?.display_name || 'CFO'}</td>
                          <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>
                            {ret.amount.toLocaleString()} UGX
                          </td>
                          <td style={{ padding: 'var(--space-2)', fontSize: '0.85rem' }}>{ret.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        {/* CFO Workflow controls Panel */}
        <aside className="oh-form-stack">
          <section className="oh-section-surface">
            <div className="oh-section-header"><div><h2>Workflow actions</h2><p>Available controls for the current state.</p></div></div>

            {/* CFO controls */}
            {isCfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {isPending && (
                  <>
                    <Button onClick={() => setApproveModalOpen(true)} style={{ width: '100%' }}>
                      Approve Request
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}
                      style={{ width: '100%', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      {rejectMutation.isPending ? 'Rejecting...' : 'Reject Request'}
                    </Button>
                  </>
                )}

                {isApproved && (
                  <Button onClick={() => setDisburseModalOpen(true)} style={{ width: '100%' }}>
                    Record Disbursement
                  </Button>
                )}

                {isDisbursed && (
                  <Button
                    onClick={() => closeMutation.mutate()}
                    disabled={outstandingBalance !== 0 || closeMutation.isPending}
                    style={{ width: '100%' }}
                  >
                    {closeMutation.isPending ? 'Closing...' : 'Close & Finalize'}
                  </Button>
                )}

                {outstandingBalance !== 0 && isDisbursed && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', textAlign: 'center', marginTop: 'var(--space-1)' }}>
                    Advance cannot be closed until outstanding balance is 0 UGX.
                  </span>
                )}

                {isCompleted && (
                  <div style={{ padding: 'var(--space-3)', background: 'var(--color-background-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Reconciliation fully completed and closed.</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 'var(--space-3)', background: 'var(--color-background-subtle)', borderRadius: 'var(--radius-md)', textTransform: 'capitalize' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Status: <strong>{request.status.replace('_', ' ')}</strong></span>
              </div>
            )}
          </section>

          {/* Log metrics panel */}
          <section className="oh-section-surface">
            <div className="oh-section-header"><div><h2>Timeline log</h2><p>Recorded actors and workflow timestamps.</p></div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Entered By</span>
                <strong>{request.profiles_entered_by?.display_name || 'System User'}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                  {new Date(request.requested_at).toLocaleString()}
                </span>
              </div>
              {request.approved_by && (
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Approved By</span>
                  <strong>{request.profiles_approved_by?.display_name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                    {request.approved_at && new Date(request.approved_at).toLocaleString()}
                  </span>
                </div>
              )}
              {request.disbursed_by && (
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Disbursed By</span>
                  <strong>{request.profiles_disbursed_by?.display_name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                    {request.disbursed_at && new Date(request.disbursed_at).toLocaleString()}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    Ref: <code>{request.disbursement_reference}</code>
                  </span>
                </div>
              )}
              {request.closed_by && (
                <div>
                  <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Closed By</span>
                  <strong>{request.profiles_closed_by?.display_name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block' }}>
                    {request.closed_at && new Date(request.closed_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* CFO Approval Modal (Warning/Override handler) */}
      <Modal open={approveModalOpen} title="Approve Cash Advance Request" onClose={() => setApproveModalOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            approveMutation.mutate()
          }}
          className="oh-form-stack"
        >
          <p style={{ margin: 0, fontSize: '0.95rem' }}>Are you sure you want to approve this cash advance request of <strong>{request.amount_requested.toLocaleString()} UGX</strong>?</p>

          {hasOutstanding && (
            <div style={{ marginTop: 'var(--space-3)' }} className="oh-form-stack">
              <div style={{ padding: 'var(--space-3)', background: 'var(--color-warning-surface)', color: 'var(--color-warning)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'start', gap: 'var(--space-2)' }}>
                <AlertTriangle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '0.85rem', display: 'block' }}>Outstanding Advance Warning</strong>
                  <span style={{ fontSize: '0.85rem' }}>This coordinator has active outstanding advances. You must log a valid justification reason to override this warning and approve.</span>
                </div>
              </div>
              <Input
                label="CFO Override Reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                required
                placeholder="e.g. Critical Jinja site materials replenishment..."
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'Approving...' : 'Approve Request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CFO Disbursement Modal */}
      <Modal open={disburseModalOpen} title="Record Funds Disbursement" onClose={() => setDisburseModalOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            disburseMutation.mutate()
          }}
          className="oh-form-stack"
        >
          <Input
            label="Disbursement Amount (UGX)"
            type="number"
            value={disburseAmount}
            onChange={(e) => setDisburseAmount(e.target.value)}
            required
            placeholder="e.g. 1500000"
          />

          <Input
            label="Disbursement Reference (Bank/MM transaction ID)"
            value={disburseRef}
            onChange={(e) => setDisburseRef(e.target.value)}
            required
            placeholder="e.g. MM-TXN-99881"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setDisburseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={disburseMutation.isPending}>
              {disburseMutation.isPending ? 'Saving...' : 'Disburse Funds'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Log Expense Modal (Coordinator) */}
      <Modal open={expenseModalOpen} title="Log Operational Expense Line" onClose={() => setExpenseModalOpen(false)}>
        <form onSubmit={handleExpenseSubmit} className="oh-form-stack">
          <Input
            label="Expense Date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />

          <div className="oh-field">
            <label className="oh-field__label">Category</label>
            <select
              className="oh-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="transport">Transport</option>
              <option value="meals">Meals / Accommodation</option>
              <option value="materials">Materials</option>
              <option value="labor">Site Casual Labor</option>
              <option value="other">Other / Miscellaneous</option>
            </select>
          </div>

          <Input
            label="Amount (UGX)"
            type="number"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            required
            placeholder="e.g. 120000"
          />

          <Input
            label="Vendor / Payee / Casual Worker Name"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            required
            placeholder="e.g. local concrete supplier, casual list..."
          />

          <div className="oh-field">
            <label className="oh-field__label">Line Item Details</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '60px', resize: 'vertical' }}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              required
              placeholder="e.g. Purchase of 4 bags of cement..."
            />
          </div>

          <div className="oh-field" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              type="checkbox"
              id="receiptUnavailableCheckbox"
              checked={receiptUnavailable}
              onChange={(e) => setReceiptUnavailable(e.target.checked)}
            />
            <label htmlFor="receiptUnavailableCheckbox" style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
              Receipt is Unavailable (Casual cash or custom voucher)
            </label>
          </div>

          {receiptUnavailable ? (
            <div className="oh-field">
              <label className="oh-field__label">Mandatory Receipt-Unavailable Explanation</label>
              <textarea
                className="oh-input"
                style={{ minHeight: '60px', resize: 'vertical' }}
                value={receiptUnavailableExplanation}
                onChange={(e) => setReceiptUnavailableExplanation(e.target.value)}
                required
                placeholder="State clearly why no receipt was issued (e.g. Boda transportation, cash Casual wages)..."
              />
            </div>
          ) : (
            <Input
              label="Receipt Evidence Link / URL"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="e.g. https://supabase.storage/receipts/txn_002.jpg"
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitExpenseMutation.isPending}>
              {submitExpenseMutation.isPending ? 'Logging...' : 'Log Expense'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Return Modal (CFO) */}
      <Modal open={returnModalOpen} title="Record Returned Unused Cash" onClose={() => setReturnModalOpen(false)}>
        <form onSubmit={handleReturnSubmit} className="oh-form-stack">
          <Input
            label="Return Date"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            required
          />

          <Input
            label="Returned Amount (UGX)"
            type="number"
            value={returnAmount}
            onChange={(e) => setReturnAmount(e.target.value)}
            required
            placeholder="e.g. 500000"
          />

          <Input
            label="Receipt / Mobilization Transaction Reference"
            value={returnRef}
            onChange={(e) => setReturnRef(e.target.value)}
            required
            placeholder="e.g. MM-RET-5591"
          />

          <div className="oh-field">
            <label className="oh-field__label">Reconciliation Notes</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '60px', resize: 'vertical' }}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="e.g. Cash returned physically at Jinja office..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={recordReturnMutation.isPending}>
              {recordReturnMutation.isPending ? 'Saving...' : 'Record Return'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Expense Review Modal (CFO Approval/Rejection panel) */}
      <Modal open={reviewModalOpen} title="Review Expense Line Item" onClose={() => setReviewModalOpen(false)}>
        <form onSubmit={handleReviewSubmit} className="oh-form-stack">
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            Are you sure you want to <strong>{acceptExpense ? 'ACCEPT' : 'DECLINE'}</strong> this logged expense item?
          </p>

          {!acceptExpense && (
            <div className="oh-field">
              <label className="oh-field__label">Mandatory Decline Reason</label>
              <textarea
                className="oh-input"
                style={{ minHeight: '60px', resize: 'vertical' }}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
                placeholder="State why this expense line item is being declined..."
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reviewExpenseMutation.isPending}>
              {reviewExpenseMutation.isPending ? 'Submitting...' : 'Confirm Review'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
