import { useMemo, useRef, useState } from 'react'

import { Button } from '../components/ui/Button'
import type { HrSetupApi, HrSetupRecords } from '../modules/hr/api/setup'
import { EmployeeForm } from '../modules/hr/components/EmployeeForm'
import { HrNavigation } from '../modules/hr/components/HrNavigation'
import { HrSetupPage } from '../modules/hr/pages/HrSetupPage'

const emptySetup = (): HrSetupRecords => ({ departments: [], jobTitles: [], payGrades: [] })

export function HrSetupPreview() {
  const records = useRef<HrSetupRecords>(emptySetup())
  const [displayedRecords, setDisplayedRecords] = useState<HrSetupRecords>(emptySetup)
  const [role, setRole] = useState<'hr' | 'employee'>('hr')
  const [view, setView] = useState<'setup' | 'assignment'>('setup')

  const api = useMemo<HrSetupApi>(() => ({
    async list() {
      return records.current
    },
    async saveDepartment(input) {
      const existing = records.current.departments.find((item) => item.id === input.id)
      const saved = {
        id: existing?.id ?? '97000000-0000-0000-0000-000000000001',
        code: String(input.code).toUpperCase(),
        name: input.name,
        description: input.description,
        archivedAt: null,
        currentEmployeeCount: existing?.currentEmployeeCount ?? 0,
        activeJobTitleCount: existing?.activeJobTitleCount ?? 0,
      }
      const nextRecords = {
        ...records.current,
        departments: existing
          ? records.current.departments.map((item) => item.id === saved.id ? saved : item)
          : [...records.current.departments, saved],
      }
      records.current = nextRecords
      setDisplayedRecords(nextRecords)
    },
    async saveJobTitle() {},
    async savePayGrade() {},
    async setArchived() {},
  }), [])

  const permissions = role === 'hr'
    ? ['employees.read', 'payroll.read', 'employees.manage_setup']
    : ['employees.read']

  function previewEmployeePermissions() {
    setRole('employee')
    setView('assignment')
  }

  return (
    <main className="oh-workspace-page" data-testid="hr-setup-preview">
      <div className="oh-dossier-actions">
        <Button variant="secondary" onClick={() => { setRole('hr'); setView('setup') }}>Preview HR permissions</Button>
        <Button variant="secondary" onClick={previewEmployeePermissions}>Preview employee permissions</Button>
        {role === 'hr' && view === 'setup' ? <Button onClick={() => setView('assignment')}>Open employee assignment</Button> : null}
      </div>

      <HrNavigation permissions={permissions} />

      {role === 'hr' && view === 'setup' ? <HrSetupPage api={api} /> : (
        <section className="oh-section-surface">
          <div className="oh-section-header">
            <div><h1>Employee assignment preview</h1><p>Active HR Setup records become controlled employee choices.</p></div>
          </div>
          <EmployeeForm
            departments={displayedRecords.departments.map((item) => ({ id: item.id, name: item.name }))}
            jobTitles={displayedRecords.jobTitles.map((item) => ({ id: item.id, name: item.name, departmentId: item.departmentId }))}
            payGrades={displayedRecords.payGrades.map((item) => ({ id: item.id, name: item.name, code: item.code }))}
            onSubmit={async () => {}}
          />
        </section>
      )}
    </main>
  )
}
