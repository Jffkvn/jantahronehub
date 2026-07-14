import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { projectsApi, type Project, type DailyUpdate } from '../api/projects'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Plus, RefreshCw, AlertTriangle, Calendar, Check, X, Image, Paperclip, Edit2 } from 'lucide-react'
import { toSafeExternalUrl } from '../../../lib/security/safeUrl'

export function DailyUpdatesTab() {
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const currentUserId = access?.profile?.id
  const canManage = permissions.includes('projects.manage')

  // UI States
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedUpdate, setSelectedUpdate] = useState<DailyUpdate | null>(null)

  // Feedback action modals
  const [endorseModalOpen, setEndorseModalOpen] = useState(false)
  const [revisionModalOpen, setRevisionModalOpen] = useState(false)
  const [actionUpdateId, setActionUpdateId] = useState('')
  const [pmFeedback, setPmFeedback] = useState('')
  const [actionError, setActionError] = useState('')

  // Form states
  const [projectId, setProjectId] = useState('')
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [newPhotoUrl, setNewPhotoUrl] = useState('')
  const [formError, setFormError] = useState('')
  const [submitStatus, setSubmitStatus] = useState<'draft' | 'submitted'>('submitted')

  // Filter states
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Fetch data
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects
  })

  const { data: updates = [], isLoading: isLoadingUpdates, refetch: refetchUpdates } = useQuery<DailyUpdate[]>({
    queryKey: ['daily-updates', filterProjectId],
    queryFn: () => projectsApi.getDailyUpdates(filterProjectId || undefined)
  })

  // Get active assignments of the current user
  // Let's resolve their assignments dynamically.
  // Actually, we can fetch assignments for all projects, but since we have the projects list,
  // we can filter down to the active projects the user is coordinator of.
  // Wait, how do we know if they are a coordinator?
  // We can run a query to check active assignments, or let them select from any project if they are CFO/admin.
  // CFO and super_admin can create daily updates for any project. PMs and Coordinators are scoped.
  // Let's check which projects the user is coordinator of.
  // We will run queries on assignments for each project or we can fetch a consolidated list.
  // Since we don't have a global getAssignments RPC, we can fetch assignments for all projects in a query if needed,
  // or simply check if the user is assigned by querying project assignments.
  // Wait, is there a simple way to find assigned projects?
  // Yes! The `projects` query returns ONLY projects the logged-in user can read!
  // PMs and coordinators can only read projects they are assigned to.
  // So `projects` list is ALREADY filtered to only their assigned projects!
  // Therefore, any project in the `projects` list is a valid project for them to submit updates to!
  // This is a beautiful property of Supabase RLS!
  const coordinatableProjects = projects.filter(p => p.status === 'active')

  // Create update mutation
  const createUpdateMutation = useMutation({
    mutationFn: () => {
      return projectsApi.createDailyUpdate({
        project_id: projectId,
        update_date: updateDate,
        summary,
        photo_urls: photoUrls,
        status: submitStatus
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-updates'] })
      queryClient.invalidateQueries({ queryKey: ['project-updates'] })
      setProjectId('')
      setSummary('')
      setPhotoUrls([])
      setCreateModalOpen(false)
      setFormError('')
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to submit update.')
    }
  })

  // Edit update mutation
  const editUpdateMutation = useMutation({
    mutationFn: () => {
      return projectsApi.updateDailyUpdate(selectedUpdate!.id, {
        summary,
        photo_urls: photoUrls,
        status: submitStatus
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-updates'] })
      queryClient.invalidateQueries({ queryKey: ['project-updates'] })
      setSelectedUpdate(null)
      setSummary('')
      setPhotoUrls([])
      setEditModalOpen(false)
      setFormError('')
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to save modifications.')
    }
  })

  // Endorse mutation
  const endorseMutation = useMutation({
    mutationFn: () => projectsApi.endorseDailyUpdate(actionUpdateId, pmFeedback || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-updates'] })
      queryClient.invalidateQueries({ queryKey: ['project-updates'] })
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
      queryClient.invalidateQueries({ queryKey: ['daily-updates'] })
      queryClient.invalidateQueries({ queryKey: ['project-updates'] })
      setRevisionModalOpen(false)
      setPmFeedback('')
      setActionUpdateId('')
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to request revision.')
    }
  })

  const handleCreateSubmit = (e: React.FormEvent, statusVal: 'draft' | 'submitted') => {
    e.preventDefault()
    if (!projectId) {
      setFormError('Please select a target project')
      return
    }
    if (!summary.trim()) {
      setFormError('Progress summary is required')
      return
    }
    setSubmitStatus(statusVal)
    // Wait for state to be set, but since setState is asynchronous, we can pass it to mutation
    // In our mutation, we read submitStatus. To be safe, we can use a setTimeout or trigger mutation directly.
    setTimeout(() => {
      createUpdateMutation.mutate()
    }, 0)
  }

  const handleEditSubmit = (e: React.FormEvent, statusVal: 'draft' | 'submitted') => {
    e.preventDefault()
    if (!summary.trim()) {
      setFormError('Progress summary is required')
      return
    }
    setSubmitStatus(statusVal)
    setTimeout(() => {
      editUpdateMutation.mutate()
    }, 0)
  }

  const addPhotoUrl = () => {
    if (!newPhotoUrl.trim()) return
    if (!newPhotoUrl.startsWith('http://') && !newPhotoUrl.startsWith('https://')) {
      setFormError('Photo link must start with http:// or https://')
      return
    }
    setPhotoUrls([...photoUrls, newPhotoUrl.trim()])
    setNewPhotoUrl('')
    setFormError('')
  }

  const removePhotoUrl = (idx: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== idx))
  }

  const openEditModal = (update: DailyUpdate) => {
    setSelectedUpdate(update)
    setProjectId(update.project_id)
    setUpdateDate(update.update_date)
    setSummary(update.summary)
    setPhotoUrls(update.photo_urls || [])
    setFormError('')
    setEditModalOpen(true)
  }

  const filteredUpdates = updates.filter(u => {
    if (filterStatus && u.status !== filterStatus) return false
    return true
  })

  const getUpdateStatusTone = (s: string): StatusTone => {
    switch (s) {
      case 'endorsed': return 'success'
      case 'revision_requested': return 'danger'
      case 'submitted': return 'info'
      case 'draft': return 'neutral'
      default: return 'neutral'
    }
  }

  const handleEndorseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    endorseMutation.mutate()
  }

  const handleRevisionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pmFeedback.trim()) {
      setActionError('Feedback is required to request revision')
      return
    }
    requestRevisionMutation.mutate()
  }

  // Check if current user is PM on any of these projects
  const isCfoOrAdmin = canManage

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Field Daily Updates</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Submit progress reports, attach photos/evidence, and verify field logs.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => void refetchUpdates()} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <RefreshCw size={15} /> Refresh
          </Button>
          {coordinatableProjects.length > 0 && (
            <Button onClick={() => {
              setProjectId('')
              setSummary('')
              setPhotoUrls([])
              setNewPhotoUrl('')
              setFormError('')
              setCreateModalOpen(true)
            }} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <Plus size={15} /> Submit Update
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', background: 'var(--color-surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <div className="oh-field" style={{ minWidth: '200px', margin: 0 }}>
          <select
            className="oh-input"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            style={{ padding: 'var(--space-2)' }}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="oh-field" style={{ minWidth: '200px', margin: 0 }}>
          <select
            className="oh-input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: 'var(--space-2)' }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Drafts</option>
            <option value="submitted">Submitted (Pending Review)</option>
            <option value="endorsed">Endorsed</option>
            <option value="revision_requested">Revision Requested</option>
          </select>
        </div>
      </div>

      {/* Updates timeline / list */}
      {isLoadingUpdates ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading daily reports...
        </div>
      ) : filteredUpdates.length === 0 ? (
        <EmptyState
          title="No daily updates match"
          description="Try adjusting your filters or submit a new field progress update."
          icon={<Calendar size={22} />}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filteredUpdates.map(update => {
            const canEdit = update.submitted_by === currentUserId && (update.status === 'draft' || update.status === 'revision_requested')

            return (
              <div key={update.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                      <Link to={`/tracker/projects/${update.project_id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }} className="oh-link">
                        {update.projects?.name}
                      </Link>
                    </h4>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-1)' }}>
                      Update Date: <strong>{new Date(update.update_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <StatusBadge tone={getUpdateStatusTone(update.status)}>
                      {update.status.toUpperCase().replace('_', ' ')}
                    </StatusBadge>
                    {canEdit && (
                      <Button variant="secondary" onClick={() => openEditModal(update)} style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        <Edit2 size={13} /> Edit
                      </Button>
                    )}
                  </div>
                </div>

                <p style={{ margin: 'var(--space-2) 0', fontSize: '0.95rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                  {update.summary}
                </p>

                {update.photo_urls && update.photo_urls.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', margin: 'var(--space-2) 0' }}>
                    {update.photo_urls.map((url, idx) => {
                      const safeUrl = toSafeExternalUrl(url)
                      return safeUrl ? (
                        <a key={idx} href={safeUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', textDecoration: 'none', background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-1) var(--space-2)', color: 'var(--color-primary)', fontSize: '0.8rem' }}>
                          <Image size={13} /> Evidence {idx + 1}
                        </a>
                      ) : null
                    })}
                  </div>
                )}

                {update.pm_feedback && (
                  <div style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: 'var(--space-3)', background: 'var(--color-background)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)' }}>
                    <small style={{ display: 'block', fontWeight: 700, color: 'var(--color-text-muted)' }}>Review Feedback:</small>
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>{update.pm_feedback}</p>
                    {update.profiles_endorsed_by && (
                      <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-1)' }}>
                        Reviewed by: {update.profiles_endorsed_by.display_name}
                      </small>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                  <small style={{ color: 'var(--color-text-muted)' }}>
                    Submitted by: <strong>{update.profiles_submitted_by?.display_name || 'Coordinator'}</strong>
                  </small>

                  {/* Endorsement Actions for PMs / CFOs */}
                  {update.status === 'submitted' && (isCfoOrAdmin) && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActionUpdateId(update.id)
                          setActionError('')
                          setRevisionModalOpen(true)
                        }}
                        style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                      >
                        <X size={14} /> Revision
                      </Button>
                      <Button
                        onClick={() => {
                          setActionUpdateId(update.id)
                          setActionError('')
                          setEndorseModalOpen(true)
                        }}
                        style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
                      >
                        <Check size={14} /> Endorse
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Submit Update Modal */}
      <Modal open={createModalOpen} title="Submit Field Daily Update" onClose={() => setCreateModalOpen(false)}>
        <form className="oh-form-stack">
          {formError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="oh-field">
            <label className="oh-field__label">Project</label>
            <select
              className="oh-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
            >
              <option value="">Select target project...</option>
              {coordinatableProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Log Date"
            type="date"
            value={updateDate}
            onChange={(e) => setUpdateDate(e.target.value)}
            required
          />

          <div className="oh-field">
            <label className="oh-field__label">Progress Summary</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '120px', resize: 'vertical' }}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Outline daily achievements, deliveries received, equipment active, or delays faced..."
              required
            />
          </div>

          <div className="oh-field" style={{ border: '1px solid var(--color-border)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-background)' }}>
            <label className="oh-field__label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <Paperclip size={14} /> Progress Evidence (Photo Links)
            </label>

            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <input
                type="text"
                className="oh-input"
                value={newPhotoUrl}
                onChange={(e) => setNewPhotoUrl(e.target.value)}
                placeholder="Paste photo/image URL here..."
                style={{ flex: 1 }}
              />
              <Button type="button" variant="secondary" onClick={addPhotoUrl}>
                Add Link
              </Button>
            </div>

            {photoUrls.length > 0 && (
              <ul style={{ padding: 0, margin: 'var(--space-3) 0 0 0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {photoUrls.map((url, idx) => (
                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px', fontFamily: 'monospace' }}>{url}</span>
                    <Button type="button" variant="secondary" onClick={() => removePhotoUrl(idx)} style={{ padding: 'var(--space-1) var(--space-2)', color: 'var(--color-danger)', borderColor: 'var(--color-danger)', fontSize: '0.75rem' }}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={(e) => handleCreateSubmit(e, 'draft')} disabled={createUpdateMutation.isPending}>
              Save Draft
            </Button>
            <Button type="button" onClick={(e) => handleCreateSubmit(e, 'submitted')} disabled={createUpdateMutation.isPending}>
              {createUpdateMutation.isPending ? 'Submitting...' : 'Submit Update'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Update Modal */}
      <Modal open={editModalOpen} title="Modify Field Daily Update" onClose={() => setEditModalOpen(false)}>
        <form className="oh-form-stack">
          {formError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="oh-field">
            <label className="oh-field__label">Project</label>
            <input type="text" className="oh-input" value={projects.find(p => p.id === projectId)?.name || ''} disabled />
          </div>

          <div className="oh-field">
            <label className="oh-field__label">Log Date</label>
            <input type="text" className="oh-input" value={updateDate} disabled />
          </div>

          <div className="oh-field">
            <label className="oh-field__label">Progress Summary</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '120px', resize: 'vertical' }}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
            />
          </div>

          <div className="oh-field" style={{ border: '1px solid var(--color-border)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-background)' }}>
            <label className="oh-field__label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <Paperclip size={14} /> Progress Evidence (Photo Links)
            </label>

            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <input
                type="text"
                className="oh-input"
                value={newPhotoUrl}
                onChange={(e) => setNewPhotoUrl(e.target.value)}
                placeholder="Paste photo/image URL here..."
                style={{ flex: 1 }}
              />
              <Button type="button" variant="secondary" onClick={addPhotoUrl}>
                Add Link
              </Button>
            </div>

            {photoUrls.length > 0 && (
              <ul style={{ padding: 0, margin: 'var(--space-3) 0 0 0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {photoUrls.map((url, idx) => (
                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px', fontFamily: 'monospace' }}>{url}</span>
                    <Button type="button" variant="secondary" onClick={() => removePhotoUrl(idx)} style={{ padding: 'var(--space-1) var(--space-2)', color: 'var(--color-danger)', borderColor: 'var(--color-danger)', fontSize: '0.75rem' }}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedUpdate?.pm_feedback && (
            <div style={{ borderLeft: '3px solid var(--color-danger)', paddingLeft: 'var(--space-3)', background: 'var(--color-danger-surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
              <small style={{ display: 'block', fontWeight: 700, color: 'var(--color-danger)' }}>PM Feedback:</small>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>{selectedUpdate.pm_feedback}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={(e) => handleEditSubmit(e, 'draft')} disabled={editUpdateMutation.isPending}>
              Save Draft
            </Button>
            <Button type="button" onClick={(e) => handleEditSubmit(e, 'submitted')} disabled={editUpdateMutation.isPending}>
              {editUpdateMutation.isPending ? 'Resubmit Update' : 'Resubmit Update'}
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
    </div>
  )
}
