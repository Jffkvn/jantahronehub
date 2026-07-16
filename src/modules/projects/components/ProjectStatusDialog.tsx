import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { projectOperationsApi } from '../api/projectOperations'
import { useAuth } from '../../auth/AuthProvider'

export function ProjectStatusDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const { access } = useAuth()
  const canTransition = Boolean(access?.permissionKeys.some((permission) => ['projects.assign_all', 'projects.update_all'].includes(permission)) || access?.roleKeys.includes('project_manager'))
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()
  const check = useQuery({ queryKey: ['projects', projectId, 'completion-check'], queryFn: () => projectOperationsApi.checkCompletion(projectId), enabled: open })
  const transition = useMutation({ mutationFn: () => projectOperationsApi.transition(projectId, 'completed', reason), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['projects', projectId] }); setOpen(false) } })
  if (!canTransition) return null
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Review completion</Button><Modal open={open} title="Complete project" onClose={() => setOpen(false)}><div className="oh-form-stack">
    {check.data?.warnings.map((warning) => <div className="oh-alert oh-alert--warning" key={warning.domain}><AlertTriangle size={16} /> {warning.message}</div>)}
    <label className="oh-label" htmlFor="completion-reason">Completion reason</label><textarea id="completion-reason" className="oh-input" value={reason} onChange={(event) => setReason(event.target.value)} />
    {transition.isError ? <div role="alert" className="oh-alert oh-alert--danger">Project cannot be completed until the listed items are resolved by their domain owner.</div> : null}
    <Button disabled={!check.data?.canComplete || reason.trim().length < 3} loading={transition.isPending} onClick={() => transition.mutate()}>Complete project</Button>
  </div></Modal></>
}
