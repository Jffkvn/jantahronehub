import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { HrSetupApi, HrSetupRecords } from '../api/setup'
import { HrSetupPage } from './HrSetupPage'

const departmentId = '11111111-1111-4111-8111-111111111111'
const jobTitleId = '22222222-2222-4222-8222-222222222222'
const payGradeId = '33333333-3333-4333-8333-333333333333'

const records: HrSetupRecords = {
  departments: [
    {
      id: departmentId,
      code: 'OPS',
      name: 'Operations',
      description: 'Field operations',
      archivedAt: null,
      currentEmployeeCount: 2,
      activeJobTitleCount: 1,
    },
  ],
  jobTitles: [
    {
      id: jobTitleId,
      departmentId,
      departmentName: 'Operations',
      code: 'TECH',
      name: 'Technician',
      description: 'Field technician',
      archivedAt: null,
      currentEmployeeCount: 2,
    },
  ],
  payGrades: [
    {
      id: payGradeId,
      code: 'G1',
      name: 'Grade One',
      currencyCode: 'UGX',
      minimumGross: 1_000_000,
      maximumGross: 2_000_000,
      description: 'Entry grade',
      archivedAt: null,
      currentEmployeeCount: 2,
    },
  ],
}

function createApi(overrides: Partial<HrSetupApi> = {}): HrSetupApi {
  return {
    list: vi.fn().mockResolvedValue(records),
    saveDepartment: vi.fn().mockResolvedValue(undefined),
    saveJobTitle: vi.fn().mockResolvedValue(undefined),
    savePayGrade: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('HrSetupPage', () => {
  it('shows loading, all setup sections and dependency context', async () => {
    let resolveRecords: ((value: HrSetupRecords) => void) | undefined
    const pending = new Promise<HrSetupRecords>((resolve) => {
      resolveRecords = resolve
    })

    renderWithProviders(
      <HrSetupPage api={createApi({ list: vi.fn().mockReturnValue(pending) })} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/loading hr setup/i)
    resolveRecords?.(records)

    expect(
      await screen.findByRole('heading', { name: /hr setup/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /departments/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /job titles/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /pay grades/i })).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText(/2 current employees/i)).toBeInTheDocument()
  })

  it('recovers from a loading error without inventing setup records', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ departments: [], jobTitles: [], payGrades: [] })
    const user = userEvent.setup()

    renderWithProviders(<HrSetupPage api={createApi({ list })} />)

    expect(await screen.findByText(/hr setup could not be loaded/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/no departments have been added/i)).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('creates a department with an audit reason and refreshes setup data', async () => {
    const api = createApi()
    const user = userEvent.setup()
    renderWithProviders(<HrSetupPage api={api} />)

    await screen.findByText('Operations')
    await user.click(screen.getByRole('button', { name: /add department/i }))
    const dialog = screen.getByRole('dialog', { name: /add department/i })
    await user.type(within(dialog).getByLabelText(/^code/i), 'fin')
    await user.type(within(dialog).getByLabelText(/^name/i), 'Finance')
    await user.type(
      within(dialog).getByLabelText(/reason for change/i),
      'Create the Finance department',
    )
    await user.click(within(dialog).getByRole('button', { name: /save department/i }))

    await waitFor(() =>
      expect(api.saveDepartment).toHaveBeenCalledWith({
        id: null,
        code: 'FIN',
        name: 'Finance',
        description: '',
        reason: 'Create the Finance department',
      }),
    )
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
  })

  it('shows dependency errors during archive and can display archived records', async () => {
    const api = createApi({
      setArchived: vi
        .fn()
        .mockRejectedValue(
          new Error('department has active job titles or current employee assignments'),
        ),
    })
    const user = userEvent.setup()
    renderWithProviders(<HrSetupPage api={api} />)

    await screen.findByText('Operations')
    await user.click(screen.getByRole('button', { name: /archive operations/i }))
    const dialog = screen.getByRole('dialog', { name: /archive department/i })
    await user.type(
      within(dialog).getByLabelText(/reason for archive/i),
      'Department is no longer used',
    )
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }))

    expect(
      await within(dialog).findByText(/active job titles or current employee/i),
    ).toBeInTheDocument()
    expect(api.setArchived).toHaveBeenCalledWith({
      kind: 'department',
      id: departmentId,
      archived: true,
      reason: 'Department is no longer used',
    })
  })
})
