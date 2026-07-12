import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { projectsApi, type Project, type ProjectAssignment, type DailyUpdate, type DailyUpdateRevision } from '../api/projects'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ArrowLeft, Edit2, AlertTriangle, Calendar, Check, X, Eye, Image } from 'lucide-react'

export function ProjectDetailsTab() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const currentUserId = access?.profile?.id
  const canManage = permissions.includes('projects.manage')

  // UI States
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedUpdate, setSelectedUpdate] = useState<DailyUpdate | null>(null)

  // Feedback modals
  const [endorseModalOpen, setEndorseModalOpen] = useState(false)
  const [revisionModalOpen, setRevisionModalOpen] = useState(false)
  const [pmFeedback, setPmFeedback] = useState('')
  const [actionUpdateId, setActionUpdateId] = useState('')
  const [actionError, setActionError] = useState('')

  // Edit Project state
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<'active' | 'completed' | 'on_hold'>('active')
  const [budget, setBudget] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')
  const [healthStatus, setHealthStatus] = useState<'on_track' | 'needs_attention' | 'at_risk'>('on_track')
  const [editError, setEditError] = useState('')

  // Member assignment state
  const [assignUserId, setAssignUserId] = useState('')
  const [assignRole, setAssignRole] = useState<'coordinator' | 'pm'>('coordinator')
  const [assignError, setAssignError] = useState('')

  // Queries
  const { data: project, isLoading: isLoadingProject } = useQuery<Project | null>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getProject(projectId!),
    enabled: !!projectId
  })

  const { data: assignments = [], isLoading: isLoadingAssignments } = useQuery<ProjectAssignment[]>({
    queryKey: ['assignments', projectId],
    queryFn: () => projectsApi.getAssignments(projectId!),
    enabled: !!projectId
  })

  const { data: updates = [], isLoading: isLoadingUpdates } = useQuery<DailyUpdate[]>({
    queryKey: ['project-updates', projectId],
    queryFn: () => projectsApi.getDailyUpdates(projectId!),
    enabled: !!projectId
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: projectsApi.getProfiles
  })

  // Mutation: Fetch revisions list on demand
  const { data: revisions = [], isFetching: isFetchingRevisions } = useQuery<DailyUpdateRevision[]>({
    queryKey: ['revisions', selectedUpdate?.id],
    queryFn: () => projectsApi.getDailyUpdateRevisions(selectedUpdate!.id),
    enabled: !!selectedUpdate
  })

  // Edit Project mutation
  const editProjectMutation = useMutation({
    mutationFn: () => {
      const budgetNum = budget ? Number(budget.replace(/,/g, '')) : null
      return projectsApi.updateProject(projectId!, {
        name,
        site_location: location || null,
        status,
        estimated_budget_ugx: budgetNum,
        budget_notes: budgetNotes || null,
        health_status: healthStatus
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditModalOpen(false)
    },
    onError: (err: Error) => {
      setEditError(err.message || 'Failed to update project.')
    }
  })

  // Member unassign mutation
  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => projectsApi.unassignUser(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  })

  // Member assign mutation
  const assignMutation = useMutation({
    mutationFn: () => projectsApi.assignUser(projectId!, assignUserId, assignRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setAssignUserId('')
      setAssignRole('coordinator')
      setAssignModalOpen(false)
    },
    onError: (err: Error) => {
      setAssignError(err.message || 'Failed to assign team member.')
    }
  })

  // Endorse mutation
  const endorseMutation = useMutation({
    mutationFn: () => projectsApi.endorseDailyUpdate(actionUpdateId, pmFeedback || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-updates', projectId] })
      queryClient.invalidateQueries({ queryKey: ['daily-updates'] })
      setEndorseModalOpen(false)
      setPmFeedback('')
      setActionUpdateId('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to endorse update.')
    }
  })

  // Request revision mutation
  const requestRevisionMutation = useMutation({
    mutationFn: () => projectsApi.requestDailyUpdateRevision(actionUpdateId, pmFeedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-updates', projectId] })
      queryClient.invalidateQueries({ queryKey: ['daily-updates'] })
      setRevisionModalOpen(false)
      setPmFeedback('')
      setActionUpdateId('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to request revision.')
    }
  })

  if (isLoadingProject) {
    return <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>Loading project profile...</div>
  }

  if (!project) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <EmptyState
          title="Project not found"
          description="The requested project profile was not found in the database."
          icon={<AlertTriangle size={22} />}
        />
        <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
          <Link to="/tracker/overview">
            <Button variant="secondary">
              <ArrowLeft size={16} /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Check if current user is PM on this project
  const isAssignedPm = assignments.some(a => a.user_id === currentUserId && a.role_on_project === 'pm')
  const isAssignedCoordinator = assignments.some(a => a.user_id === currentUserId && a.role_on_project === 'coordinator')
  const canModifyProject = canManage || isAssignedPm

  const openEditModal = () => {
    setName(project.name)
    setLocation(project.site_location || '')
    setStatus(project.status)
    setBudget(project.estimated_budget_ugx ? String(project.estimated_budget_ugx) : '')
    setBudgetNotes(project.budget_notes || '')
    setHealthStatus(project.health_status)
    setEditError('')
    setEditModalOpen(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setEditError('Project name is required')
      return
    }
    editProjectMutation.mutate()
  }

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignUserId) {
      setAssignError('Please select a member')
      return
    }
    assignMutation.mutate()
  }

  const handleEndorseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    endorseMutation.mutate()
  }

  const handleRevisionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pmFeedback.trim()) {
      setActionError('Feedback notes are required for revision requests.')
      return
    }
    requestRevisionMutation.mutate()
  }

  const getStatusTone = (s: string): StatusTone => {
    switch (s) {
      case 'active': return 'success'
      case 'completed': return 'info'
      case 'on_hold': return 'warning'
      default: return 'neutral'
    }
  }

  const getHealthTone = (h: string): StatusTone => {
    switch (h) {
      case 'on_track': return 'success'
      case 'needs_attention': return 'warning'
      case 'at_risk': return 'danger'
      default: return 'neutral'
    }
  }

  const getUpdateStatusTone = (s: string): StatusTone => {
    switch (s) {
      case 'endorsed': return 'success'
      case 'revision_requested': return 'danger'
      case 'submitted': return 'info'
      case 'draft': return 'neutral'
      default: return 'neutral'
    }
  }

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—'
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Link to="/tracker/overview">
          <Button variant="secondary" style={{ padding: 'var(--space-2)' }}>
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{project.name}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
            {project.site_location || 'No physical site location specified'}
          </p>
        </div>
      </div>

      {/* Main Grid: Details & Team */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>

        {/* Left Side: General Profile Card */}
        <section className="oh-detail-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', background: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-3)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Project Profile</h3>
            {canModifyProject && (
              <Button onClick={openEditModal} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', padding: 'var(--space-2) var(--space-3)', fontSize: '0.875rem' }}>
                <Edit2 size={14} /> Edit Profile
              </Button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <small style={{ color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>Delivery Status</small>
              <StatusBadge tone={getStatusTone(project.status)} style={{ marginTop: 'var(--space-1)' }}>
                {project.status.toUpperCase()}
              </StatusBadge>
            </div>
            <div>
              <small style={{ color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>Operational Health</small>
              <StatusBadge tone={getHealthTone(project.health_status)} style={{ marginTop: 'var(--space-1)' }}>
                {project.health_status.toUpperCase().replace('_', ' ')}
              </StatusBadge>
            </div>
            <div>
              <small style={{ color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>Estimated Budget</small>
              <p style={{ margin: 'var(--space-1) 0 0 0', fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace' }}>
                {formatCurrency(project.estimated_budget_ugx)}
              </p>
            </div>
            <div>
              <small style={{ color: 'var(--color-text-muted)', display: 'block', fontWeight: 600 }}>Budget Set By</small>
              <p style={{ margin: 'var(--space-1) 0 0 0', color: 'var(--color-text)' }}>
                {project.profiles_budget_set_by?.display_name || '—'}
              </p>
            </div>
          </div>

          {project.budget_notes && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
              <small style={{ color: 'var(--color-text-muted)', display: 'block', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Project Notes</small>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>{project.budget_notes}</p>
            </div>
          )}
        </section>

        {/* Right Side: Assignments */}
        <section className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Assigned Members</h3>
            {canModifyProject && (
              <Button variant="secondary" onClick={() => setAssignModalOpen(true)} style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.8rem' }}>
                Assign
              </Button>
            )}
          </div>

          {isLoadingAssignments ? (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>Loading assignments...</div>
          ) : assignments.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>No active assignments.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {assignments.map(assign => (
                <li key={assign.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-background)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block' }}>{assign.profiles?.display_name}</span>
                    <small style={{ color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{assign.role_on_project}</small>
                  </div>
                  {canModifyProject && (
                    <Button
                      variant="secondary"
                      onClick={() => unassignMutation.mutate(assign.id)}
                      style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                      disabled={unassignMutation.isPending}
                    >
                      Unassign
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Daily Updates section */}
      <section className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-3)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Progress Update History</h3>
          {(isAssignedCoordinator || isAssignedPm || canManage) && (
            <Link to="/tracker/daily-updates">
              <Button style={{ fontSize: '0.875rem' }}>Submit Update</Button>
            </Link>
          )}
        </div>

        {isLoadingUpdates ? (
          <div style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading updates...</div>
        ) : updates.length === 0 ? (
          <EmptyState
            title="No updates submitted yet"
            description="Operational field updates for this project will be listed here once submitted."
            icon={<Calendar size={22} />}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {updates.map(update => (
              <div key={update.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', background: 'var(--color-background)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                      {new Date(update.update_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-1)' }}>
                      Submitted by: <strong>{update.profiles_submitted_by?.display_name || 'Coordinator'}</strong>
                    </small>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <StatusBadge tone={getUpdateStatusTone(update.status)}>
                      {update.status.toUpperCase().replace('_', ' ')}
                    </StatusBadge>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedUpdate(update)
                        setHistoryModalOpen(true)
                      }}
                      style={{ padding: 'var(--space-1) var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '0.8rem' }}
                    >
                      <Eye size={14} /> History
                    </Button>
                  </div>
                </div>

                <p style={{ margin: 'var(--space-2) 0', fontSize: '0.95rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                  {update.summary}
                </p>

                {update.photo_urls && update.photo_urls.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', margin: 'var(--space-2) 0' }}>
                    {update.photo_urls.map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', textDecoration: 'none', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', color: 'var(--color-primary)', fontSize: '0.875rem' }}>
                        <Image size={15} /> Evidence {idx + 1}
                      </a>
                    ))}
                  </div>
                )}

                {update.pm_feedback && (
                  <div style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: 'var(--space-3)', background: 'var(--color-surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', margin: 'var(--space-3) 0 0 0' }}>
                    <small style={{ display: 'block', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>Review Feedback:</small>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text)' }}>{update.pm_feedback}</p>
                    {update.profiles_endorsed_by && (
                      <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-1)' }}>
                        Reviewed by: {update.profiles_endorsed_by.display_name}
                      </small>
                    )}
                  </div>
                )}

                {/* PM/CFO Endorsement Actions */}
                {update.status === 'submitted' && (isAssignedPm || canManage) && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActionUpdateId(update.id)
                        setActionError('')
                        setRevisionModalOpen(true)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)', fontSize: '0.875rem' }}
                    >
                      <X size={15} /> Request Revision
                    </Button>
                    <Button
                      onClick={() => {
                        setActionUpdateId(update.id)
                        setActionError('')
                        setEndorseModalOpen(true)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '0.875rem' }}
                    >
                      <Check size={15} /> Endorse Update
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit Project Modal */}
      <Modal open={editModalOpen} title="Edit Project Details" onClose={() => setEditModalOpen(false)}>
        <form onSubmit={handleEditSubmit} className="oh-form-stack">
          {editError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} />
              <span>{editError}</span>
            </div>
          )}

          <Input
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Site Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="oh-field">
              <label className="oh-field__label">Project Status</label>
              <select
                className="oh-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'completed' | 'on_hold')}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>

            <div className="oh-field">
              <label className="oh-field__label">Operational Health</label>
              <select
                className="oh-input"
                value={healthStatus}
                onChange={(e) => setHealthStatus(e.target.value as 'on_track' | 'needs_attention' | 'at_risk')}
              >
                <option value="on_track">On Track</option>
                <option value="needs_attention">Needs Attention</option>
                <option value="at_risk">At Risk</option>
              </select>
            </div>
          </div>

          <Input
            label="Estimated Budget (UGX)"
            type="text"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />

          <div className="oh-field">
            <label className="oh-field__label">Budget & Delivery Notes</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={budgetNotes}
              onChange={(e) => setBudgetNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editProjectMutation.isPending}>
              {editProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Member Modal */}
      <Modal open={assignModalOpen} title="Assign Operational Role" onClose={() => setAssignModalOpen(false)}>
        <form onSubmit={handleAssignSubmit} className="oh-form-stack">
          {assignError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} />
              <span>{assignError}</span>
            </div>
          )}

          <div className="oh-field">
            <label className="oh-field__label">Team Member Profile</label>
            <select
              className="oh-input"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              required
            >
              <option value="">Select profile...</option>
              {profiles.map(pr => (
                <option key={pr.id} value={pr.id}>{pr.display_name}</option>
              ))}
            </select>
          </div>

          <div className="oh-field">
            <label className="oh-field__label">Operational Role</label>
            <select
              className="oh-input"
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value as 'coordinator' | 'pm')}
              required
            >
              <option value="coordinator">Coordinator (Field updates submission)</option>
              <option value="pm">Project Manager (Oversight and approval)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Assigning...' : 'Assign Role'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Endorse Modal */}
      <Modal open={endorseModalOpen} title="Endorse Daily Update" onClose={() => setEndorseModalOpen(false)}>
        <form onSubmit={handleEndorseSubmit} className="oh-form-stack">
          {actionError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}>{actionError}</div>
          )}
          <p style={{ margin: 0, fontSize: '0.95rem' }}>Are you sure you want to endorse this field update? It will be logged as verified operational progress.</p>
          <div className="oh-field">
            <label className="oh-field__label">Feedback Notes (Optional)</label>
            <textarea
              className="oh-input"
              value={pmFeedback}
              onChange={(e) => setPmFeedback(e.target.value)}
              placeholder="Good progress. Site clearing complete."
              style={{ minHeight: '80px', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setEndorseModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={endorseMutation.isPending}>
              {endorseMutation.isPending ? 'Saving...' : 'Endorse Progress'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revision Request Modal */}
      <Modal open={revisionModalOpen} title="Request Update Revision" onClose={() => setRevisionModalOpen(false)}>
        <form onSubmit={handleRevisionSubmit} className="oh-form-stack">
          {actionError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}>{actionError}</div>
          )}
          <p style={{ margin: 0, fontSize: '0.95rem' }}>Send this daily update back to the coordinator for revision. They will be requested to modify and resubmit it.</p>
          <div className="oh-field">
            <label className="oh-field__label">Revision Feedback (Required)</label>
            <textarea
              className="oh-input"
              value={pmFeedback}
              onChange={(e) => setPmFeedback(e.target.value)}
              placeholder="Detail what needs to be added, e.g. 'Please attach photos of the excavation area.'"
              required
              style={{ minHeight: '100px', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setRevisionModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={requestRevisionMutation.isPending} style={{ backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)', color: '#fff' }}>
              {requestRevisionMutation.isPending ? 'Saving...' : 'Request Revision'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revisions History Drawer Modal */}
      <Modal open={historyModalOpen} title="Update Revision History" onClose={() => {
        setHistoryModalOpen(false)
        setSelectedUpdate(null)
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {isFetchingRevisions ? (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading revision records...</div>
          ) : revisions.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>No historical revisions recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {revisions.map((rev, index) => (
                <div key={rev.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', background: 'var(--color-background)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <strong style={{ fontSize: '0.9rem' }}>Version {revisions.length - index}</strong>
                    <small style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(rev.created_at).toLocaleString()} by {rev.profiles_created_by?.display_name || 'System'}
                    </small>
                  </div>

                  <div style={{ margin: 'var(--space-2) 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                    {rev.summary}
                  </div>

                  {rev.photo_urls && rev.photo_urls.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', margin: 'var(--space-2) 0' }}>
                      {rev.photo_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', textDecoration: 'none', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-1) var(--space-2)', color: 'var(--color-primary)', fontSize: '0.8rem' }}>
                          <Image size={12} /> Image {i + 1}
                        </a>
                      ))}
                    </div>
                  )}

                  {rev.pm_feedback && (
                    <div style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 'var(--space-2)', background: 'var(--color-surface)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)' }}>
                      <small style={{ display: 'block', fontWeight: 700, color: 'var(--color-text-muted)' }}>Feedback:</small>
                      <p style={{ margin: 0, fontSize: '0.8rem' }}>{rev.pm_feedback}</p>
                    </div>
                  )}

                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <small style={{ color: 'var(--color-text-muted)' }}>Status logged as: </small>
                    <StatusBadge tone={getUpdateStatusTone(rev.status)} style={{ fontSize: '0.75rem' }}>
                      {rev.status.replace('_', ' ')}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => {
              setHistoryModalOpen(false)
              setSelectedUpdate(null)
            }}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
