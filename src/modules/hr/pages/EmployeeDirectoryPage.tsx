import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Search, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { employeeApi, type EmployeeApi, type EmployeeSummary } from '../api/employees'
import { EmployeeForm } from '../components/EmployeeForm'
import type { EmployeeFormValues } from '../schemas/employee'

export function EmployeeDirectoryPage({ api = employeeApi }: { api?: EmployeeApi }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const employees = useQuery({ queryKey: ['employees'], queryFn: api.list })
  const setup = useQuery({ queryKey: ['employee-setup'], queryFn: api.setup })
  const createEmployee = useMutation({
    mutationFn: (values: EmployeeFormValues) => api.create(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      setCreating(false)
    },
  })
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return employees.data ?? []
    return (employees.data ?? []).filter((employee) =>
      [employee.legalName, employee.employeeNumber, employee.companyEmail, employee.departmentName, employee.jobTitleName]
        .some((value) => value?.toLowerCase().includes(needle)),
    )
  }, [employees.data, search])

  const columns = [
    { key: 'employee', header: 'Employee', render: (row: EmployeeSummary) => <div className="oh-person-cell"><strong>{row.legalName}</strong><span>{row.employeeNumber}</span></div> },
    { key: 'role', header: 'Assignment', render: (row: EmployeeSummary) => <div className="oh-person-cell"><strong>{row.jobTitleName ?? 'Not assigned'}</strong><span>{row.departmentName ?? 'No department'}</span></div> },
    { key: 'contact', header: 'Contact', render: (row: EmployeeSummary) => row.companyEmail ?? row.workPhone ?? '—' },
    { key: 'status', header: 'Status', render: (row: EmployeeSummary) => <StatusBadge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'action', header: '', render: (row: EmployeeSummary) => <Link className="oh-text-link" to={`/hr/employees/${row.id}`} aria-label={`View ${row.legalName}`}>View dossier</Link> },
  ]

  return <section className="oh-workspace-page">
    <header className="oh-page-header"><div><p>People operations</p><h1>Employee directory</h1><span>Maintain employment records, assignments and offboarding in one place.</span></div><div className="oh-dossier-actions"><Link className="oh-button oh-button--secondary" to="/hr/payroll">Payroll</Link><Link className="oh-button oh-button--secondary" to="/hr/employees/import"><FileSpreadsheet size={17} /> Import / export</Link><Button onClick={() => setCreating(true)}><UserPlus size={17} /> Add employee</Button></div></header>
    <div className="oh-toolbar"><label className="oh-search"><Search size={18} aria-hidden="true" /><span className="oh-sr-only">Search employees</span><input type="search" aria-label="Search employees" placeholder="Search name, ID, role or department" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span>{filtered.length} employee{filtered.length === 1 ? '' : 's'}</span></div>
    {employees.isLoading ? <p role="status">Loading employees…</p> : employees.isError ? <EmptyState icon={<Users />} title="Employees could not be loaded" description="Try again or contact the OneHub administrator." action={<Button variant="secondary" onClick={() => void employees.refetch()}>Try again</Button>} /> : <DataTable caption="Egypro employees" columns={columns} rows={filtered} rowKey={(row) => row.id} emptyMessage={search ? 'No employees match your search.' : 'No employees have been added yet.'} />}
    <Modal open={creating} title="Add employee" onClose={() => setCreating(false)}><EmployeeForm departments={setup.data?.departments} jobTitles={setup.data?.jobTitles} payGrades={setup.data?.payGrades} submitting={createEmployee.isPending} onSubmit={async (values) => { await createEmployee.mutateAsync(values) }} /></Modal>
  </section>
}
