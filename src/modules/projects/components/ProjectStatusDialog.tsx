import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { projectOperationsApi } from '../api/projectOperations'
import { useAuth } from '../../auth/AuthProvider'

type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'archived'

const statusOptions: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'archived', label: 'Archived' },
]

export function ProjectStatusDialog({ projectId, currentStatus }: { projectId: string; currentStatus: ProjectStatus }) {
  const [open, setOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState<ProjectStatus>(currentStatus === 'planned' ? 'active' : 'planned')
  const [reason, setReason] = useState('')
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const canTransition = Boolean(access?.permissionKeys.some((permission) => ['projects.assign_all', 'projects.update_all'].includes(permission)) || access?.roleKeys.includes('project_manager'))
  const completionCheck = useQuery({
    queryKey: ['projects', projectId, 'completion-check'],
    queryFn: () => projectOperationsApi.checkCompletion(projectId),
    enabled: open && targetStatus === 'completed'
  })
  const transition = useMutation({
    mutationFn: () => projectOperationsApi.transition(projectId, targetStatus, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setOpen(false)
      setReason('')
    }
  })
  if (!canTransition) return null
  const completionBlocked = targetStatus === 'completed' && !completionCheck.data?.canComplete
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}><RefreshCw size={16} /> Change status</Button>
    <Modal open={open} title="Change project status" onClose={() => setOpen(false)}>
      <div className="oh-form-stack">
        <div className="oh-field">
          <label className="oh-field__label" htmlFor="project-target-status">New status</label>
          <select id="project-target-status" className="oh-input" value={targetStatus} onChange={(event) => setTargetStatus(event.target.value as ProjectStatus)}>
            {statusOptions.filter((option) => option.value !== currentStatus).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {targetStatus === 'completed' && completionCheck.isLoading ? <div role="status">Checking cash and inventory reconciliation…</div> : null}
        {targetStatus === 'completed' ? completionCheck.data?.warnings.map((warning) => <div className="oh-alert oh-alert--warning" key={warning.domain}><AlertTriangle size={16} /> {warning.message}</div>) : null}
        <div className="oh-field">
          <label className="oh-field__label" htmlFor="status-change-reason">Reason for status change</label>
          <textarea id="status-change-reason" className="oh-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record why the project status is changing." />
        </div>
        {transition.isError ? <div role="alert" className="oh-alert oh-alert--danger">Project status could not be changed. Resolve any listed reconciliation items and try again.</div> : null}
        <Button disabled={reason.trim().length < 3 || completionBlocked} loading={transition.isPending} onClick={() => transition.mutate()}>Save status</Button>
      </div>
    </Modal>
  </>
}
