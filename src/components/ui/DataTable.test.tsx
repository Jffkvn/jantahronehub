import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { DataTable, type DataTableColumn } from './DataTable'

interface EmployeeRow {
  name: string
  role: string
}

describe('DataTable', () => {
  const columns: DataTableColumn<EmployeeRow>[] = [
    { key: 'name', header: 'Employee', render: (row) => row.name },
    { key: 'role', header: 'Role', render: (row) => row.role },
  ]

  it('renders a labelled table with row data', () => {
    renderWithProviders(
      <DataTable
        caption="Active employees"
        columns={columns}
        rows={[{ name: 'Amina K.', role: 'Coordinator' }]}
        rowKey={(row) => row.name}
      />,
    )

    expect(screen.getByRole('table', { name: 'Active employees' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Employee' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Amina K.' })).toBeVisible()
  })

  it('shows a clear empty state instead of an empty table body', () => {
    renderWithProviders(
      <DataTable
        caption="Active employees"
        columns={columns}
        rows={[]}
        rowKey={(row) => row.name}
        emptyMessage="No employees match these filters."
      />,
    )

    expect(screen.getByText('No employees match these filters.')).toBeVisible()
  })
})
