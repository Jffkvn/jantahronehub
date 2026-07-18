import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import type { PerformanceReview } from '../api/performance'

export interface PerformanceReviewEditorValue {
  reviewId: string
  managerComments: string
  recommendIncrement: boolean
  recommendPromotion: boolean
  goals: { description: string; managerRating: number }[]
}

export function PerformanceReviewEditor({ review, saving, onSave, onSubmit }: { review: PerformanceReview; saving?: boolean; onSave: (value: PerformanceReviewEditorValue) => Promise<void>; onSubmit: (value: PerformanceReviewEditorValue) => Promise<void> }) {
  const [comments, setComments] = useState(review.managerComments ?? '')
  const [increment, setIncrement] = useState(review.recommendIncrement)
  const [promotion, setPromotion] = useState(review.recommendPromotion)
  const [goals, setGoals] = useState(review.goals.length ? review.goals.map(({ description, managerRating }) => ({ description, managerRating })) : [{ description: '', managerRating: 3 }])
  const [error, setError] = useState('')
  useEffect(() => { setComments(review.managerComments ?? ''); setIncrement(review.recommendIncrement); setPromotion(review.recommendPromotion); setGoals(review.goals.length ? review.goals.map(({ description, managerRating }) => ({ description, managerRating })) : [{ description: '', managerRating: 3 }]) }, [review])
  const editable = ['draft', 'reopened'].includes(review.status)
  const value = (): PerformanceReviewEditorValue => ({ reviewId: review.id, managerComments: comments, recommendIncrement: increment, recommendPromotion: promotion, goals })
  async function perform(action: (payload: PerformanceReviewEditorValue) => Promise<void>) { setError(''); try { await action(value()) } catch (caught) { setError(caught instanceof Error ? caught.message : 'The review could not be saved.') } }
  if (!editable) return <div className="oh-card"><p><strong>Manager comments</strong></p><p>{review.managerComments || 'No comments recorded.'}</p><div className="oh-kpi-band"><article className="oh-kpi"><span className="oh-kpi__label">Overall score</span><strong className="oh-kpi__value">{review.overallScore?.toFixed(1) ?? '—'}</strong></article><article className="oh-kpi"><span className="oh-kpi__label">Increment</span><strong className="oh-kpi__value">{review.recommendIncrement ? 'Recommended' : 'No'}</strong></article><article className="oh-kpi"><span className="oh-kpi__label">Promotion</span><strong className="oh-kpi__value">{review.recommendPromotion ? 'Recommended' : 'No'}</strong></article></div>{review.goals.map((goal) => <p key={goal.id}>{goal.description} <strong>{goal.managerRating}/5</strong></p>)}</div>
  return <div className="oh-form">
    <section className="oh-card"><h3>Goals and KPI ratings</h3>{goals.map((goal, index) => <div className="oh-form-grid" key={index}><label className="oh-field"><span className="oh-field__label">Goal {index + 1}</span><input className="oh-input" value={goal.description} onChange={(event) => setGoals(goals.map((item, position) => position === index ? { ...item, description: event.target.value } : item))} /></label><label className="oh-field"><span className="oh-field__label">Rating (1–5)</span><select className="oh-input" value={goal.managerRating} onChange={(event) => setGoals(goals.map((item, position) => position === index ? { ...item, managerRating: Number(event.target.value) } : item))}>{[1,2,3,4,5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>{goals.length > 1 ? <Button variant="ghost" iconOnly aria-label={`Remove goal ${index + 1}`} onClick={() => setGoals(goals.filter((_, position) => position !== index))}><Trash2 size={17} /></Button> : null}</div>)}<Button variant="secondary" onClick={() => setGoals([...goals, { description: '', managerRating: 3 }])}><Plus size={17} /> Add goal</Button></section>
    <label className="oh-field"><span className="oh-field__label">Manager assessment</span><textarea className="oh-input oh-textarea" value={comments} onChange={(event) => setComments(event.target.value)} /></label>
    <div className="oh-inline-actions"><label><input type="checkbox" checked={increment} onChange={(event) => setIncrement(event.target.checked)} /> Recommend salary increment</label><label><input type="checkbox" checked={promotion} onChange={(event) => setPromotion(event.target.checked)} /> Recommend promotion</label></div>
    {error ? <FormError>{error}</FormError> : null}<div className="oh-form-actions"><Button variant="secondary" loading={saving} onClick={() => perform(onSave)}>Save draft</Button><Button loading={saving} onClick={() => perform(onSubmit)}>Submit to HR</Button></div>
  </div>
}
