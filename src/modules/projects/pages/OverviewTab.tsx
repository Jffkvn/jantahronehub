import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi, type Project } from '../api/projects'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Plus, Users, RefreshCw, FolderGit2, AlertTriangle } from 'lucide-react'

export function OverviewTab() {
  const queryClient = useQueryClient()
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const canManage = permissions.includes('projects.manage')

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)

  // Form states for creating a project
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<'active' | 'completed' | 'on_hold'>('active')
  const [budget, setBudget] = useState('')
  const [budgetNotes, setBudgetNotes] = useState('')
  const [healthStatus, setHealthStatus] = useState<'on_track' | 'needs_attention' | 'at_risk'>('on_track')
  const [formError, setFormError] = useState('')

  // Form states for assignment
  const [assignProjectId, setAssignProjectId] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [assignRole, setAssignRole] = useState<'coordinator' | 'pm'>('coordinator')
  const [assignError, setAssignError] = useState('')

  // Fetch lists
  const { data: projects = [], isLoading: isLoadingProjects, refetch: refetchProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: projectsApi.getProfiles,
  })

  // Create Project mutation
  const createProjectMutation = useMutation({
    mutationFn: () => {
      const budgetNum = budget ? Number(budget.replace(/,/g, '')) : null
      return projectsApi.createProject({
        name,
        site_location: location || null,
        status,
        estimated_budget_ugx: budgetNum,
        budget_notes: budgetNotes || null,
        health_status: healthStatus
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setName('')
      setLocation('')
      setStatus('active')
      setBudget('')
      setBudgetNotes('')
      setHealthStatus('on_track')
      setCreateModalOpen(false)
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create project.')
    }
  })

  // Assign user mutation
  const assignUserMutation = useMutation({
    mutationFn: () => {
      return projectsApi.assignUser(assignProjectId, assignUserId, assignRole)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      // Trigger update on assignments queries
      queryClient.invalidateQueries({ queryKey: ['assignments', assignProjectId] })
      setAssignProjectId('')
      setAssignUserId('')
      setAssignRole('coordinator')
      setAssignModalOpen(false)
      setAssignError('')
    },
    onError: (err: any) => {
      setAssignError(err.message || 'Failed to create assignment.')
    }
  })

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Project name is required')
      return
    }
    createProjectMutation.mutate()
  }

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignProjectId || !assignUserId || !assignRole) {
      setAssignError('All fields are required')
      return
    }
    assignUserMutation.mutate()
  }

  // Calculate quick metrics
  const totalCount = projects.length
  const activeCount = projects.filter(p => p.status === 'active').length
  const completedCount = projects.filter(p => p.status === 'completed').length
  const atRiskCount = projects.filter(p => p.health_status === 'at_risk').length
  const attentionCount = projects.filter(p => p.health_status === 'needs_attention').length

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

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—'
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Quick Action Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Projects Dashboard</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Manage development projects, assignments, and field tracking.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => void refetchProjects()} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <RefreshCw size={15} /> Refresh
          </Button>
          {canManage && (
            <>
              <Button onClick={() => setCreateModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <Plus size={15} /> New Project
              </Button>
              <Button variant="secondary" onClick={() => setAssignModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <Users size={15} /> Assign Member
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Total Projects</small>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: 'var(--space-2) 0 0 0', lineHeight: 1 }}>{totalCount}</p>
        </div>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Active Projects</small>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: 'var(--space-2) 0 0 0', color: 'var(--color-success)', lineHeight: 1 }}>{activeCount}</p>
        </div>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Completed Projects</small>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: 'var(--space-2) 0 0 0', color: 'var(--color-info)', lineHeight: 1 }}>{completedCount}</p>
        </div>
        <div className="oh-detail-card" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', background: 'var(--color-surface)' }}>
          <small style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>At Risk / Attention</small>
          <p style={{ fontSize: '2rem', fontWeight: 800, margin: 'var(--space-2) 0 0 0', color: atRiskCount > 0 ? 'var(--color-danger)' : attentionCount > 0 ? 'var(--color-warning)' : 'var(--color-text)', lineHeight: 1 }}>
            {atRiskCount} <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>/ {attentionCount}</span>
          </p>
        </div>
      </div>

      {/* Projects Table */}
      {isLoadingProjects ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto var(--space-4)' }} />
          Loading project portfolio...
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects found"
          description="There are currently no projects configured in the system."
          icon={<FolderGit2 size={22} />}
        />
      ) : (
        <div className="oh-table-wrapper">
          <table className="oh-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Project Name</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Site Location</th>
                <th style={{ textAlign: 'center', padding: 'var(--space-3)' }}>Status</th>
                <th style={{ textAlign: 'center', padding: 'var(--space-3)' }}>Health</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-3)' }}>Est. Budget</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Date Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-3)', fontWeight: 600 }}>
                    <Link to={`/tracker/projects/${project.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }} className="oh-link">
                      {project.name}
                    </Link>
                  </td>
                  <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)' }}>{project.site_location || '—'}</td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <StatusBadge tone={getStatusTone(project.status)}>
                      {project.status.replace('_', ' ')}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <StatusBadge tone={getHealthTone(project.health_status)}>
                      {project.health_status.replace('_', ' ')}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatCurrency(project.estimated_budget_ugx)}
                  </td>
                  <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {new Date(project.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Project Modal */}
      <Modal open={createModalOpen} title="Configure New Project" onClose={() => setCreateModalOpen(false)}>
        <form onSubmit={handleCreateSubmit} className="oh-form-stack">
          {formError && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <Input
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Entebbe Bypass Construction"
          />

          <Input
            label="Site Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Entebbe Road, Kampala"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="oh-field">
              <label className="oh-field__label">Project Status</label>
              <select
                className="oh-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>

            <div className="oh-field">
              <label className="oh-field__label">Initial Health Status</label>
              <select
                className="oh-input"
                value={healthStatus}
                onChange={(e) => setHealthStatus(e.target.value as any)}
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
            placeholder="e.g. 50,000,000"
          />

          <div className="oh-field">
            <label className="oh-field__label">Budget & Delivery Notes</label>
            <textarea
              className="oh-input"
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={budgetNotes}
              onChange={(e) => setBudgetNotes(e.target.value)}
              placeholder="Record structural objectives, delivery timelines, or budget limitations..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProjectMutation.isPending}>
              {createProjectMutation.isPending ? 'Saving...' : 'Create Project'}
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
            <label className="oh-field__label">Target Project</label>
            <select
              className="oh-input"
              value={assignProjectId}
              onChange={(e) => setAssignProjectId(e.target.value)}
              required
            >
              <option value="">Select a project...</option>
              {projects.filter(p => p.status === 'active').map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

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
              onChange={(e) => setAssignRole(e.target.value as any)}
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
            <Button type="submit" disabled={assignUserMutation.isPending}>
              {assignUserMutation.isPending ? 'Assigning...' : 'Assign Role'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
