import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FormError } from '../../../components/ui/FormError'
import { Modal } from '../../../components/ui/Modal'
import { performanceApi, type PerformanceApi, type PerformanceReview } from '../../hr/api/performance'
import { PerformanceReviewEditor } from '../../hr/components/PerformanceReviewEditor'
import { PortalHeader } from './shared'

const labels: Record<PerformanceReview['status'], string> = { draft: 'Draft assessment', reopened: 'Changes requested', manager_submitted: 'Awaiting HR approval', hr_approved: 'Ready for acknowledgment', employee_acknowledged: 'Acknowledged' }

export function MyPerformancePage({ api = performanceApi }: { api?: PerformanceApi }) {
  const queryClient = useQueryClient(); const [params, setParams] = useSearchParams(); const [selected, setSelected] = useState<PerformanceReview | null>(null); const [comment, setComment] = useState('')
  const assigned = useQuery({ queryKey: ['performance-assigned-reviews'], queryFn: api.listAssignedReviews }); const mine = useQuery({ queryKey: ['performance-my-reviews'], queryFn: api.listMyReviews }); const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['performance-assigned-reviews'] }), queryClient.invalidateQueries({ queryKey: ['performance-my-reviews'] })])
  const save = useMutation({ mutationFn: api.saveReview, onSuccess: refresh }); const submit = useMutation({ mutationFn: async (value: Parameters<PerformanceApi['saveReview']>[0]) => { await api.saveReview(value); await api.submitReview(value.reviewId) }, onSuccess: refresh }); const acknowledge = useMutation({ mutationFn: (reviewId: string) => api.acknowledge({ reviewId, comment }), onSuccess: async () => { setSelected(null); setComment(''); await refresh() } })
  const all = [...(assigned.data ?? []), ...(mine.data ?? [])].filter((review, index, rows) => rows.findIndex((item) => item.id === review.id) === index); const viewing = selected ?? all.find((review) => review.id === params.get('review')) ?? null
  const close = () => { setSelected(null); if (params.has('review')) { const next = new URLSearchParams(params); next.delete('review'); setParams(next, { replace: true }) } }
  return <section><PortalHeader eyebrow="Growth and development" title="My Performance" description="Complete assigned assessments and acknowledge your released performance reviews." />
    {(assigned.isLoading || mine.isLoading) ? <p role="status">Loading performance reviews…</p> : null}{(assigned.isError || mine.isError) ? <FormError>Performance reviews could not be loaded.</FormError> : null}
    {all.length ? <div className="oh-card-grid">{all.map((review) => <article className="oh-card" key={review.id}><BarChart3 size={22} /><p>{review.cycleName}</p><h2>{review.employeeName}</h2><p>Reviewer: {review.reviewerName}</p><strong>{labels[review.status]}</strong>{review.overallScore ? <p>Overall score: {review.overallScore.toFixed(1)}/5</p> : null}<Button variant="secondary" onClick={() => setSelected(review)}>{review.reviewerProfileId && ['draft','reopened'].includes(review.status) ? 'Open assessment' : 'View review'}</Button></article>)}</div> : !assigned.isLoading && !mine.isLoading ? <EmptyState icon={<BarChart3 />} title="No performance reviews yet" description="Assigned assessments and HR-released reviews will appear here." /> : null}
    <Modal open={Boolean(viewing)} title="Performance review" onClose={close}>{viewing ? <div className="oh-form"><h3>{viewing.employeeName}</h3><p>{viewing.cycleName} · {labels[viewing.status]}</p>{['draft','reopened'].includes(viewing.status) ? <PerformanceReviewEditor review={viewing} saving={save.isPending || submit.isPending} onSave={(value) => save.mutateAsync(value)} onSubmit={(value) => submit.mutateAsync(value)} /> : <><p><strong>Manager comments</strong></p><p>{viewing.managerComments}</p>{viewing.goals.map((goal) => <p key={goal.id}>{goal.description}: <strong>{goal.managerRating}/5</strong></p>)}{viewing.hrReason ? <p><strong>HR decision:</strong> {viewing.hrReason}</p> : null}{viewing.status === 'hr_approved' ? <><label className="oh-field"><span className="oh-field__label">Acknowledgment comment (optional)</span><textarea className="oh-input oh-textarea" value={comment} onChange={(event) => setComment(event.target.value)} /></label><Button loading={acknowledge.isPending} onClick={() => acknowledge.mutate(viewing.id)}>Acknowledge review</Button></> : null}</>}</div> : null}</Modal>
  </section>
}
