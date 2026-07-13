import { Search, UserPlus, Users } from 'lucide-react'

import { Button } from '../components/ui/Button'

const previewEmployees = [
  { number: 'EGY-001', name: 'Sarah Nakato', role: 'Finance Officer', status: 'Active' },
  { number: 'EGY-014', name: 'Moses Okello', role: 'Field Coordinator', status: 'Active' },
]

export function HrPreview() {
  return (
    <main className="oh-workspace-page" data-testid="hr-preview">
      <header className="oh-page-header">
        <div>
          <p>People operations</p>
          <h1>Employee directory</h1>
          <span>Maintain employment records, contacts and lifecycle status.</span>
        </div>
        <Button><UserPlus size={16} aria-hidden="true" /> Add employee</Button>
      </header>

      <section className="oh-kpi-band" data-testid="employee-metrics" aria-label="Employee metrics">
        <article className="oh-kpi">
          <span className="oh-kpi__label">Total employees</span>
          <strong className="oh-kpi__value">32</strong>
        </article>
        <article className="oh-kpi">
          <span className="oh-kpi__label">Active staff</span>
          <strong className="oh-kpi__value oh-kpi__value--success">19</strong>
        </article>
        <article className="oh-kpi">
          <span className="oh-kpi__label">Ending contracts</span>
          <strong className="oh-kpi__value oh-kpi__value--warning">3</strong>
        </article>
      </section>

      <section className="oh-section-surface">
        <div className="oh-section-header">
          <div>
            <h2>Employees</h2>
            <p>Current employee profiles and employment status.</p>
          </div>
          <label className="oh-search">
            <Search size={16} aria-hidden="true" />
            <span className="oh-sr-only">Search employees</span>
            <input placeholder="Search employees" />
          </label>
        </div>
        <div className="oh-table-wrap" style={{ marginTop: 'var(--space-5)' }}>
          <table className="oh-table oh-responsive-table">
            <caption>Employee preview</caption>
            <thead><tr><th>Employee</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {previewEmployees.map((employee) => (
                <tr key={employee.number}>
                  <td data-label="Employee"><span className="oh-inline-icon"><Users size={16} aria-hidden="true" /><span className="oh-person-cell"><strong>{employee.name}</strong><span>{employee.number}</span></span></span></td>
                  <td data-label="Role">{employee.role}</td>
                  <td data-label="Status">{employee.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
