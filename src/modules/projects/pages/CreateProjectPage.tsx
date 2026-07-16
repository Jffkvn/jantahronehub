import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { Combobox } from '../../../components/ui/Combobox'
import { FormError } from '../../../components/ui/FormError'
import { Input } from '../../../components/ui/Input'
import { MultiCombobox } from '../../../components/ui/MultiCombobox'
import { useAuth } from '../../auth/AuthProvider'
import { projectsApi } from '../api/projects'
import { useProjectDraft } from '../hooks/useProjectDraft'

interface ProjectDraft {
  projectCode: string
  name: string
  clientName: string
  siteLocation: string
  plannedStartDate: string
  expectedEndDate: string
  contractReference: string
  budgetReference: string
  operationalNotes: string
  estimatedBudgetUgx: string
  budgetNotes: string
  status: 'planned' | 'active' | 'on_hold'
  healthStatus: 'on_track' | 'needs_attention' | 'at_risk'
  primaryPmId: string | null
  coordinatorIds: string[]
  reason: string
}

const initialDraft: ProjectDraft = {
  projectCode: '',
  name: '',
  clientName: '',
  siteLocation: '',
  plannedStartDate: '',
  expectedEndDate: '',
  contractReference: '',
  budgetReference: '',
  operationalNotes: '',
  estimatedBudgetUgx: '',
  budgetNotes: '',
  status: 'planned',
  healthStatus: 'on_track',
  primaryPmId: null,
  coordinatorIds: [],
  reason: '',
}

export function CreateProjectPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const profileId = auth.access?.profile?.id ?? 'unknown'
  const isProjectManager = auth.access?.roleKeys.includes('project_manager') ?? false
  const canCreate = auth.access?.permissionKeys.includes('projects.create') ?? false
  const { draft, setDraft, clearDraft } = useProjectDraft(profileId, initialDraft)
  const [formError, setFormError] = useState('')
  const candidatesQuery = useQuery({
    queryKey: ['projects', 'assignment-candidates'],
    queryFn: projectsApi.listCandidates,
    enabled: canCreate,
  })
  const candidates = candidatesQuery.data ?? []
  const pmOptions = candidates
    .filter((candidate) => candidate.roleKeys.includes('project_manager'))
    .map((candidate) => ({ value: candidate.profileId, label: candidate.displayName }))
  const coordinatorOptions = candidates
    .filter((candidate) => candidate.roleKeys.includes('coordinator'))
    .map((candidate) => ({ value: candidate.profileId, label: candidate.displayName }))
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initialDraft), [draft])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const mutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (projectId) => {
      clearDraft()
      navigate(`/projects/${projectId}/summary`)
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const update = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (!draft.projectCode.trim() || !draft.name.trim() || draft.reason.trim().length < 3) {
      setFormError('Project code, project name, and a meaningful creation reason are required.')
      return
    }
    if (draft.plannedStartDate && draft.expectedEndDate && draft.expectedEndDate < draft.plannedStartDate) {
      setFormError('Expected end date cannot be before the planned start date.')
      return
    }
    mutation.mutate({
      project: {
        projectCode: draft.projectCode,
        name: draft.name,
        clientName: draft.clientName || null,
        siteLocation: draft.siteLocation || null,
        plannedStartDate: draft.plannedStartDate || null,
        expectedEndDate: draft.expectedEndDate || null,
        contractReference: draft.contractReference || null,
        budgetReference: draft.budgetReference || null,
        operationalNotes: draft.operationalNotes || null,
        estimatedBudgetUgx: draft.estimatedBudgetUgx ? Number(draft.estimatedBudgetUgx.replace(/,/g, '')) : null,
        budgetNotes: draft.budgetNotes || null,
        status: draft.status,
        healthStatus: draft.healthStatus,
      },
      primaryPmId: isProjectManager ? profileId : draft.primaryPmId,
      coordinatorIds: draft.coordinatorIds,
      reason: draft.reason,
    })
  }

  if (!canCreate) {
    return <section className="oh-card"><h1>Project creation unavailable</h1><p>Your role can view projects but cannot create them.</p></section>
  }

  return (
    <section className="oh-workspace-page oh-project-create">
      <Link className="oh-back-link" to="/projects"><ArrowLeft size={16} /> Back to projects</Link>
      <header className="oh-page-header">
        <div><p>Projects</p><h1>Create project</h1><span>Set the project identity, schedule, controls, and initial team.</span></div>
      </header>
      <form noValidate onSubmit={submit}>
        {formError ? <FormError>{formError}</FormError> : null}
        <section className="oh-card oh-project-form-section">
          <div><p className="oh-section-eyebrow">01 · Foundation</p><h2>Project identity</h2></div>
          <div className="oh-form-grid">
            <Input label="Project code" required value={draft.projectCode} onChange={(event) => update('projectCode', event.target.value)} />
            <Input label="Project name" required value={draft.name} onChange={(event) => update('name', event.target.value)} />
            <Input label="Client name" value={draft.clientName} onChange={(event) => update('clientName', event.target.value)} />
            <Input label="Site location" value={draft.siteLocation} onChange={(event) => update('siteLocation', event.target.value)} />
            <Input label="Contract reference" value={draft.contractReference} onChange={(event) => update('contractReference', event.target.value)} />
            <Input label="Budget reference" value={draft.budgetReference} onChange={(event) => update('budgetReference', event.target.value)} />
          </div>
        </section>

        <section className="oh-card oh-project-form-section">
          <div><p className="oh-section-eyebrow">02 · Delivery</p><h2>Schedule and controls</h2></div>
          <div className="oh-form-grid">
            <Input label="Planned start date" type="date" value={draft.plannedStartDate} onChange={(event) => update('plannedStartDate', event.target.value)} />
            <Input label="Expected end date" type="date" value={draft.expectedEndDate} onChange={(event) => update('expectedEndDate', event.target.value)} />
            <label className="oh-field"><span className="oh-field__label">Initial status</span><select className="oh-input" value={draft.status} onChange={(event) => update('status', event.target.value as ProjectDraft['status'])}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option></select></label>
            <label className="oh-field"><span className="oh-field__label">Operational health</span><select className="oh-input" value={draft.healthStatus} onChange={(event) => update('healthStatus', event.target.value as ProjectDraft['healthStatus'])}><option value="on_track">On track</option><option value="needs_attention">Needs attention</option><option value="at_risk">At risk</option></select></label>
            <Input label="Estimated budget (UGX)" inputMode="decimal" value={draft.estimatedBudgetUgx} onChange={(event) => update('estimatedBudgetUgx', event.target.value)} />
            <Input label="Budget notes" value={draft.budgetNotes} onChange={(event) => update('budgetNotes', event.target.value)} />
          </div>
          <label className="oh-field"><span className="oh-field__label">Operational notes</span><textarea className="oh-input oh-textarea" value={draft.operationalNotes} onChange={(event) => update('operationalNotes', event.target.value)} /></label>
        </section>

        <section className="oh-card oh-project-form-section">
          <div><p className="oh-section-eyebrow">03 · Responsibility</p><h2>Project team</h2></div>
          {isProjectManager ? (
            <Input label="Primary project manager" value="You will be assigned automatically" disabled />
          ) : (
            <Combobox label="Primary project manager" options={pmOptions} value={draft.primaryPmId} onChange={(value) => update('primaryPmId', value)} placeholder="Optional — appoint later if needed" />
          )}
          <MultiCombobox label="Project coordinators" options={coordinatorOptions} values={draft.coordinatorIds} onChange={(values) => update('coordinatorIds', values)} placeholder="Search coordinators" />
          <Input label="Creation reason" required hint="This is retained in the project audit history." value={draft.reason} onChange={(event) => update('reason', event.target.value)} />
        </section>

        <div className="oh-project-form-actions">
          <button className="oh-button oh-button--secondary" type="button" onClick={() => { clearDraft(); navigate('/projects') }}>Discard</button>
          <Button type="submit" loading={mutation.isPending}>Create project</Button>
        </div>
      </form>
    </section>
  )
}
