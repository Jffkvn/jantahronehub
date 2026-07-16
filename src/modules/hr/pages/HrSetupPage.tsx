import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BriefcaseBusiness, Building2, CircleDollarSign, Plus, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Modal } from '../../../components/ui/Modal'
import {
  hrSetupApi,
  type DepartmentSetupRecord,
  type HrSetupApi,
  type JobTitleSetupRecord,
  type PayGradeSetupRecord,
} from '../api/setup'
import { DepartmentForm } from '../components/DepartmentForm'
import { JobTitleForm } from '../components/JobTitleForm'
import { PayGradeForm } from '../components/PayGradeForm'
import { SetupRecordList, type SetupDisplayRecord } from '../components/SetupRecordList'
import type { DepartmentInput, JobTitleInput, PayGradeInput } from '../schemas/setup'

type Section = 'departments' | 'job_titles' | 'pay_grades'
type Editor =
  | { kind: 'department'; record: DepartmentSetupRecord | null }
  | { kind: 'job_title'; record: JobTitleSetupRecord | null }
  | { kind: 'pay_grade'; record: PayGradeSetupRecord | null }
type ArchiveTarget = {
  kind: 'department' | 'job_title' | 'pay_grade'
  id: string
  name: string
  archived: boolean
}

const sectionLabels: Record<Section, string> = {
  departments: 'Departments',
  job_titles: 'Job titles',
  pay_grades: 'Pay grades',
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'HR setup request could not be completed.'
}

function money(value: number | null, currency: string) {
  if (value === null) return 'No limit'
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function HrSetupPage({ api = hrSetupApi }: { api?: HrSetupApi }) {
  const queryClient = useQueryClient()
  const [section, setSection] = useState<Section>('departments')
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)
  const [archiveReason, setArchiveReason] = useState('')

  const setup = useQuery({ queryKey: ['hr-setup'], queryFn: api.list })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hr-setup'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-setup'] }),
    ])
  }

  const saveDepartment = useMutation({
    mutationFn: (values: DepartmentInput) => api.saveDepartment(values),
    onSuccess: async () => { await refresh(); setEditor(null) },
  })
  const saveJobTitle = useMutation({
    mutationFn: (values: JobTitleInput) => api.saveJobTitle(values),
    onSuccess: async () => { await refresh(); setEditor(null) },
  })
  const savePayGrade = useMutation({
    mutationFn: (values: PayGradeInput) => api.savePayGrade(values),
    onSuccess: async () => { await refresh(); setEditor(null) },
  })
  const toggleArchived = useMutation({
    mutationFn: async () => {
      if (!archiveTarget) return
      await api.setArchived({
        kind: archiveTarget.kind,
        id: archiveTarget.id,
        archived: !archiveTarget.archived,
        reason: archiveReason,
      })
    },
    onSuccess: async () => {
      await refresh()
      setArchiveTarget(null)
      setArchiveReason('')
    },
  })

  const displayedRecords = useMemo<SetupDisplayRecord[]>(() => {
    if (!setup.data) return []

    if (section === 'departments') {
      return setup.data.departments
        .filter((record) => showArchived || !record.archivedAt)
        .map((record) => ({
          id: record.id,
          code: record.code,
          name: record.name,
          detail: record.description || 'No description',
          dependencies: `${record.currentEmployeeCount} current employee${record.currentEmployeeCount === 1 ? '' : 's'} · ${record.activeJobTitleCount} active job title${record.activeJobTitleCount === 1 ? '' : 's'}`,
          archived: Boolean(record.archivedAt),
        }))
    }
    if (section === 'job_titles') {
      return setup.data.jobTitles
        .filter((record) => showArchived || !record.archivedAt)
        .map((record) => ({
          id: record.id,
          code: record.code,
          name: record.name,
          detail: record.departmentName ?? 'Company-wide',
          dependencies: `${record.currentEmployeeCount} current employee${record.currentEmployeeCount === 1 ? '' : 's'}`,
          archived: Boolean(record.archivedAt),
        }))
    }
    return setup.data.payGrades
      .filter((record) => showArchived || !record.archivedAt)
      .map((record) => ({
        id: record.id,
        code: record.code,
        name: record.name,
        detail: `${money(record.minimumGross, record.currencyCode)} – ${money(record.maximumGross, record.currencyCode)}`,
        dependencies: `${record.currentEmployeeCount} current employee${record.currentEmployeeCount === 1 ? '' : 's'}`,
        archived: Boolean(record.archivedAt),
      }))
  }, [section, setup.data, showArchived])

  function openCreate() {
    if (section === 'departments') setEditor({ kind: 'department', record: null })
    if (section === 'job_titles') setEditor({ kind: 'job_title', record: null })
    if (section === 'pay_grades') setEditor({ kind: 'pay_grade', record: null })
  }

  function openEdit(id: string) {
    if (!setup.data) return
    if (section === 'departments') setEditor({ kind: 'department', record: setup.data.departments.find((item) => item.id === id) ?? null })
    if (section === 'job_titles') setEditor({ kind: 'job_title', record: setup.data.jobTitles.find((item) => item.id === id) ?? null })
    if (section === 'pay_grades') setEditor({ kind: 'pay_grade', record: setup.data.payGrades.find((item) => item.id === id) ?? null })
  }

  function openArchive(id: string) {
    const record = displayedRecords.find((item) => item.id === id)
    if (!record) return
    setArchiveReason('')
    setArchiveTarget({
      kind: section === 'departments' ? 'department' : section === 'job_titles' ? 'job_title' : 'pay_grade',
      id,
      name: record.name,
      archived: record.archived,
    })
  }

  if (setup.isLoading) return <p role="status">Loading HR setup…</p>
  if (setup.isError) {
    return (
      <EmptyState
        icon={<Settings2 />}
        title="HR setup could not be loaded"
        description="Try again. Existing employee records have not been changed."
        action={<Button variant="secondary" onClick={() => void setup.refetch()}>Try again</Button>}
      />
    )
  }

  const addLabel = section === 'departments' ? 'Add department' : section === 'job_titles' ? 'Add job title' : 'Add pay grade'
  const saveError = saveDepartment.error ?? saveJobTitle.error ?? savePayGrade.error

  return (
    <section className="oh-workspace-page oh-setup-page">
      <header className="oh-page-header">
        <div>
          <p>People structure</p>
          <h1>HR Setup</h1>
          <span>Define the departments, job titles and pay grades used by employee records.</span>
        </div>
        <Button onClick={openCreate}><Plus size={17} aria-hidden="true" /> {addLabel}</Button>
      </header>

      <div className="oh-setup-guidance">
        <Settings2 size={19} aria-hidden="true" />
        <div><strong>Configure these lists before assigning employees.</strong><span>Archive outdated options to preserve payroll and employment history.</span></div>
      </div>

      <div className="oh-setup-sections" role="tablist" aria-label="HR setup areas">
        {([
          ['departments', <Building2 size={17} aria-hidden="true" />],
          ['job_titles', <BriefcaseBusiness size={17} aria-hidden="true" />],
          ['pay_grades', <CircleDollarSign size={17} aria-hidden="true" />],
        ] as const).map(([key, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={`oh-portal-tab${section === key ? ' oh-portal-tab--active' : ''}`}
            onClick={() => setSection(key)}
          >
            {icon}{sectionLabels[key]}
          </button>
        ))}
      </div>

      <section className="oh-section-surface">
        <div className="oh-section-header">
          <div><h2>{sectionLabels[section]}</h2><p>{displayedRecords.length} record{displayedRecords.length === 1 ? '' : 's'} shown</p></div>
          <label className="oh-setup-archive-filter"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label>
        </div>
        <SetupRecordList
          caption={sectionLabels[section]}
          records={displayedRecords}
          emptyMessage={`No ${sectionLabels[section].toLowerCase()} have been added yet.`}
          onEdit={openEdit}
          onToggleArchived={openArchive}
        />
      </section>

      <Modal
        open={Boolean(editor)}
        title={`${editor?.record ? 'Edit' : 'Add'} ${editor?.kind === 'job_title' ? 'job title' : editor?.kind === 'pay_grade' ? 'pay grade' : 'department'}`}
        onClose={() => setEditor(null)}
      >
        {saveError ? <p className="oh-form-error" role="alert">{errorMessage(saveError)}</p> : null}
        {editor?.kind === 'department' ? (
          <DepartmentForm
            initialValues={editor.record ? { id: editor.record.id, code: editor.record.code, name: editor.record.name, description: editor.record.description } : undefined}
            submitting={saveDepartment.isPending}
            onCancel={() => setEditor(null)}
            onSubmit={async (values) => { await saveDepartment.mutateAsync(values) }}
          />
        ) : null}
        {editor?.kind === 'job_title' ? (
          <JobTitleForm
            departments={setup.data?.departments ?? []}
            initialValues={editor.record ? { id: editor.record.id, departmentId: editor.record.departmentId, code: editor.record.code, name: editor.record.name, description: editor.record.description } : undefined}
            submitting={saveJobTitle.isPending}
            onCancel={() => setEditor(null)}
            onSubmit={async (values) => { await saveJobTitle.mutateAsync(values) }}
          />
        ) : null}
        {editor?.kind === 'pay_grade' ? (
          <PayGradeForm
            initialValues={editor.record ? { id: editor.record.id, code: editor.record.code, name: editor.record.name, currencyCode: editor.record.currencyCode, minimumGross: editor.record.minimumGross, maximumGross: editor.record.maximumGross, description: editor.record.description } : undefined}
            submitting={savePayGrade.isPending}
            onCancel={() => setEditor(null)}
            onSubmit={async (values) => { await savePayGrade.mutateAsync(values) }}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(archiveTarget)}
        title={`${archiveTarget?.archived ? 'Restore' : 'Archive'} ${archiveTarget?.kind.replace('_', ' ') ?? 'record'}`}
        onClose={() => setArchiveTarget(null)}
      >
        <div className="oh-setup-form">
          <p>“{archiveTarget?.name}” will {archiveTarget?.archived ? 'become available for new employee assignments' : 'stop appearing in new employee assignments'}. Historical records remain unchanged.</p>
          <label className="oh-field">
            <span className="oh-field__label">Reason for {archiveTarget?.archived ? 'restore' : 'archive'} *</span>
            <textarea className="oh-input oh-textarea" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} />
          </label>
          {toggleArchived.error ? <p className="oh-form-error" role="alert">{errorMessage(toggleArchived.error)}</p> : null}
          <div className="oh-form-actions">
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button
              variant={archiveTarget?.archived ? 'primary' : 'danger'}
              loading={toggleArchived.isPending}
              disabled={archiveReason.trim().length < 3}
              onClick={() => toggleArchived.mutate()}
            >
              {archiveTarget?.archived ? 'Restore' : 'Archive'}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
