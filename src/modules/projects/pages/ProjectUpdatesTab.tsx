import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { useAuth } from '../../auth/AuthProvider'
import { projectsApi, type DailyUpdate } from '../api/projects'
import { projectQueryKeys } from '../types'

export function ProjectUpdatesTab({ projectId }: { projectId: string }) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [summary, setSummary] = useState('')
  const [photoUrls, setPhotoUrls] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const assignmentsQuery = useQuery({
    queryKey: projectQueryKeys.assignments(projectId),
    queryFn: () => projectsApi.getAssignments(projectId),
  })
  const updatesQuery = useQuery({
    queryKey: projectQueryKeys.updates(projectId),
    queryFn: () => projectsApi.getDailyUpdates(projectId),
  })
  const profileId = access?.profile?.id
  const isCoordinator = assignmentsQuery.data?.some(
    (assignment) => assignment.user_id === profileId && assignment.role_on_project === 'coordinator',
  ) ?? false
  const isPm = assignmentsQuery.data?.some(
    (assignment) => assignment.user_id === profileId && assignment.role_on_project === 'pm',
  ) ?? false
  const canReview = isPm && (access?.permissionKeys.includes('daily_updates.endorse') ?? false)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: projectQueryKeys.updates(projectId) })
  const saveMutation = useMutation({
    mutationFn: (submit: boolean) => projectsApi.saveDailyUpdate({
      updateId: null,
      projectId,
      updateDate: date,
      summary,
      photoUrls: photoUrls.split('\n').map((url) => url.trim()).filter(Boolean),
      submit,
    }),
    onSuccess: () => {
      setSummary('')
      setPhotoUrls('')
      setError('')
      refresh()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })
  const reviewMutation = useMutation({
    mutationFn: ({ update, decision }: { update: DailyUpdate; decision: 'endorse' | 'request_revision' }) =>
      projectsApi.reviewDailyUpdate(update.id, decision, feedback || null),
    onSuccess: () => {
      setFeedback('')
      setError('')
      refresh()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })
  const save = (submit: boolean) => {
    if (!summary.trim()) {
      setError('Enter the progress summary before saving.')
      return
    }
    saveMutation.mutate(submit)
  }

  return (
    <div className="oh-project-updates">
      {error ? <FormError>{error}</FormError> : null}
      {isCoordinator ? (
        <section className="oh-card oh-project-update-form">
          <div><h3>Record today’s field update</h3><p>Save a draft or submit it to the assigned project manager.</p></div>
          <label className="oh-field"><span className="oh-field__label">Update date</span><input className="oh-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="oh-field"><span className="oh-field__label">Progress summary</span><textarea className="oh-input oh-textarea" value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
          <label className="oh-field"><span className="oh-field__label">Evidence photo links</span><textarea className="oh-input" placeholder="One private evidence link per line" value={photoUrls} onChange={(event) => setPhotoUrls(event.target.value)} /></label>
          <div className="oh-project-form-actions"><Button variant="secondary" onClick={() => save(false)}>Save draft</Button><Button onClick={() => save(true)}>Submit update</Button></div>
        </section>
      ) : null}
      {canReview ? <label className="oh-field"><span className="oh-field__label">PM feedback</span><input className="oh-input" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Required when requesting revision" /></label> : null}
      <section className="oh-project-updates-list">
        {updatesQuery.isLoading ? <p role="status">Loading project updates…</p> : null}
        {updatesQuery.data?.map((update) => (
          <article className="oh-card" key={update.id}>
            <div className="oh-project-update-meta"><div><strong>{update.profiles_submitted_by?.display_name ?? 'Project coordinator'}</strong><span>{update.update_date}</span></div><StatusBadge>{update.status.replace('_', ' ')}</StatusBadge></div>
            <p>{update.summary}</p>
            {update.photo_urls.length ? <span className="oh-update-evidence"><Camera size={15} /> {update.photo_urls.length} evidence file{update.photo_urls.length === 1 ? '' : 's'}</span> : null}
            {update.pm_feedback ? <blockquote>PM feedback: {update.pm_feedback}</blockquote> : null}
            {canReview && update.status === 'submitted' ? (
              <div className="oh-project-form-actions">
                <Button variant="secondary" onClick={() => reviewMutation.mutate({ update, decision: 'request_revision' })}><RotateCcw size={15} /> Request revision</Button>
                <Button onClick={() => reviewMutation.mutate({ update, decision: 'endorse' })}><CheckCircle2 size={15} /> Endorse</Button>
              </div>
            ) : null}
          </article>
        ))}
        {!updatesQuery.isLoading && !updatesQuery.data?.length ? <div className="oh-card"><p>No updates recorded for this project yet.</p></div> : null}
      </section>
    </div>
  )
}
