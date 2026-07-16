import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '../../../components/ui/Button'
import { Combobox } from '../../../components/ui/Combobox'
import { FormError } from '../../../components/ui/FormError'
import { useAuth } from '../../auth/AuthProvider'
import { projectsApi } from '../api/projects'
import { projectQueryKeys } from '../types'

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function ProjectTeamTab({ projectId }: { projectId: string }) {
  const { access } = useAuth()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [pmId, setPmId] = useState<string | null>(null)
  const [coordinatorId, setCoordinatorId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const assignmentsQuery = useQuery({
    queryKey: projectQueryKeys.assignments(projectId),
    queryFn: () => projectsApi.getAssignments(projectId),
  })
  const historyQuery = useQuery({
    queryKey: [...projectQueryKeys.assignments(projectId), 'history'],
    queryFn: () => projectsApi.getAssignmentHistory(projectId),
  })
  const candidatesQuery = useQuery({
    queryKey: ['projects', 'assignment-candidates'],
    queryFn: projectsApi.listCandidates,
  })
  const assignments = assignmentsQuery.data ?? []
  const primaryPm = assignments.find((assignment) => assignment.role_on_project === 'pm')
  const coordinators = assignments.filter((assignment) => assignment.role_on_project === 'coordinator')
  const canAssignAll = access?.permissionKeys.includes('projects.assign_all') ?? false
  const isAssignedPm = assignments.some(
    (assignment) =>
      assignment.role_on_project === 'pm'
      && assignment.user_id === access?.profile?.id,
  )
  const canManageCoordinators = canAssignAll || isAssignedPm
  const pmOptions = useMemo(() => (candidatesQuery.data ?? [])
    .filter((candidate) => candidate.roleKeys.includes('project_manager'))
    .map((candidate) => ({ value: candidate.profileId, label: candidate.displayName })), [candidatesQuery.data])
  const coordinatorOptions = useMemo(() => (candidatesQuery.data ?? [])
    .filter((candidate) => candidate.roleKeys.includes('coordinator'))
    .map((candidate) => ({ value: candidate.profileId, label: candidate.displayName })), [candidatesQuery.data])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: projectQueryKeys.assignments(projectId) })
  }
  const assignMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'pm' | 'coordinator' }) =>
      projectsApi.assign(projectId, userId, role, reason),
    onSuccess: () => {
      setReason('')
      setPmId(null)
      setCoordinatorId(null)
      setError('')
      refresh()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })
  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => projectsApi.unassign(assignmentId, reason),
    onSuccess: () => {
      setReason('')
      setError('')
      refresh()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  const requireReason = () => {
    if (reason.trim().length >= 3) return true
    setError('Enter a reason before changing a project assignment.')
    return false
  }

  return (
    <div className="oh-project-team">
      {error ? <FormError>{error}</FormError> : null}
      <section className="oh-card">
        <div className="oh-team-section-header"><div><h3>Primary project manager</h3><p>One accountable PM can be active at a time.</p></div></div>
        <div className="oh-team-member">
          <span className="oh-team-avatar" aria-hidden="true">{initials(primaryPm?.profiles?.display_name ?? 'Not appointed')}</span><div><strong>{primaryPm?.profiles?.display_name ?? 'Not appointed'}</strong><span>{primaryPm ? 'Primary project manager' : 'CFO can appoint one when ready'}</span></div>
        </div>
        {canAssignAll ? (
          <div className="oh-team-action">
            <Combobox label="Appoint or replace PM" options={pmOptions} value={pmId} onChange={setPmId} />
            <Button disabled={!pmId} onClick={() => { if (pmId && requireReason()) assignMutation.mutate({ userId: pmId, role: 'pm' }) }}>Appoint or replace PM</Button>
          </div>
        ) : null}
      </section>

      <section className="oh-card">
        <div className="oh-team-section-header"><div><h3>Coordinators</h3><p>Multiple field coordinators can work on the same project.</p></div></div>
        {coordinators.length ? <ul className="oh-project-team-list">{coordinators.map((coordinator) => (
          <li key={coordinator.id}>
            <div className="oh-team-person"><span className="oh-team-avatar" aria-hidden="true">{initials(coordinator.profiles?.display_name ?? 'Coordinator')}</span><div><strong>{coordinator.profiles?.display_name ?? 'Coordinator'}</strong><span>Field coordinator</span><small>Assigned {coordinator.assigned_at.slice(0, 10)}</small></div></div>
            {canManageCoordinators ? <button className="oh-button oh-button--ghost" type="button" onClick={() => { if (requireReason()) unassignMutation.mutate(coordinator.id) }}>Remove</button> : null}
          </li>
        ))}</ul> : <p>No coordinators assigned yet.</p>}
        {canManageCoordinators ? (
          <div className="oh-team-action">
            <Combobox label="Add coordinator" options={coordinatorOptions} value={coordinatorId} onChange={setCoordinatorId} />
            <Button onClick={() => {
              if (!requireReason()) return
              if (coordinatorId) assignMutation.mutate({ userId: coordinatorId, role: 'coordinator' })
            }}>Add coordinator</Button>
          </div>
        ) : null}
      </section>

      {(canAssignAll || canManageCoordinators) ? (
        <label className="oh-field"><span className="oh-field__label">Reason for assignment change</span><textarea className="oh-input oh-textarea" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      ) : null}

      <section className="oh-card">
        <h3>Assignment history</h3>
        {historyQuery.data?.length ? <ul className="oh-project-team-list">{historyQuery.data.map((assignment) => (
          <li key={assignment.id}><div><strong>{assignment.profiles?.display_name ?? 'Team member'}</strong><span>{assignment.assignment_reason ?? 'Assignment recorded'}</span></div><small>{assignment.unassigned_at ? `Ended ${assignment.unassigned_at.slice(0, 10)} · ${assignment.unassignment_reason ?? 'No reason'}` : 'Active'}</small></li>
        ))}</ul> : <p>No earlier assignment changes.</p>}
      </section>
    </div>
  )
}
