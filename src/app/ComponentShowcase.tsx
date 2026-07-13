import { useState } from 'react'

import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { FormError } from '../components/ui/FormError'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { StatusBadge } from '../components/ui/StatusBadge'

const employeeColumns = [
  { key: 'name', header: 'Employee', render: (row: { name: string }) => row.name },
  { key: 'role', header: 'Role', render: (row: { role: string }) => row.role },
  {
    key: 'status',
    header: 'Status',
    render: () => <StatusBadge tone="success">Active</StatusBadge>,
  },
]

export function ComponentShowcase() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <main className="oh-showcase">
      <header className="oh-showcase__header">
        <p className="oh-showcase__eyebrow">Design system</p>
        <h1>OneHub components</h1>
        <p>
          Accessible, responsive primitives for consistent HR, payroll, warehouse,
          and project operations.
        </p>
      </header>

      <div className="oh-showcase__grid">
        <section className="oh-showcase__card oh-showcase__card--wide">
          <h2>Module navigation</h2>
          <nav className="oh-portal-tabs" aria-label="Module navigation preview">
            {['Overview', 'Consumables', 'Equipment', 'Requests', 'Ledger History', 'Bulk Tools'].map(
              (label, index) => (
                <a
                  className={`oh-portal-tab${index === 0 ? ' oh-portal-tab--active' : ''}`}
                  href={`#${label.toLowerCase().replaceAll(' ', '-')}`}
                  key={label}
                >
                  {label}
                </a>
              ),
            )}
          </nav>
          <nav className="oh-portal-tabs" aria-label="Button tab preview">
            <button className="oh-portal-tab oh-portal-tab--active" type="button">
              Workforce Summary
            </button>
            <button className="oh-portal-tab" type="button">Payroll &amp; Statutory</button>
          </nav>
        </section>

        <section className="oh-showcase__card">
          <h2>Actions</h2>
          <div className="oh-showcase__row">
            <Button>Save changes</Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open dialog
            </Button>
            <Button variant="danger">Archive</Button>
          </div>
        </section>

        <section className="oh-showcase__card">
          <h2>Form controls</h2>
          <Input label="Company email" hint="Use the employee's work address" />
          <FormError>Example validation message.</FormError>
        </section>

        <section className="oh-showcase__card">
          <h2>Statuses</h2>
          <div className="oh-showcase__row">
            <StatusBadge tone="success">Approved</StatusBadge>
            <StatusBadge tone="warning">Pending review</StatusBadge>
            <StatusBadge tone="danger">Overdue</StatusBadge>
            <StatusBadge tone="info">Draft</StatusBadge>
          </div>
        </section>

        <section className="oh-showcase__card">
          <h2>Empty state</h2>
          <EmptyState
            title="No stock requests"
            description="New project requests will appear here."
            action={<Button variant="secondary">Create request</Button>}
          />
        </section>

        <section className="oh-showcase__card oh-showcase__card--wide">
          <h2>Data table</h2>
          <DataTable
            caption="Example employees"
            columns={employeeColumns}
            rows={[{ name: 'Amina K.', role: 'Coordinator' }]}
            rowKey={(row) => row.name}
          />
        </section>
      </div>

      <Modal
        open={modalOpen}
        title="Archive employee"
        onClose={() => setModalOpen(false)}
      >
        <p>This record will leave active lists while its history remains intact.</p>
        <div className="oh-showcase__row">
          <Button variant="danger">Confirm archive</Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </main>
  )
}
