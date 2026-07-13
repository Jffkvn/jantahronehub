import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import type { HistoricalPayrollImportApi, HistoricalPayrollStage } from '../payroll/historicalPayrollImportApi'
import { HistoricalPayrollMigrationPage } from './HistoricalPayrollMigrationPage'

function stage(overrides: Partial<HistoricalPayrollStage> = {}): HistoricalPayrollStage {
  return {
    parsed: {
      periods: [{
        sheetName: 'June 2026',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        label: 'June 2026',
        rowCount: 1,
        totals: { gross: 1000000, paye: 100000, nssfEmployee: 50000, nssfEmployer: 100000, wht: 0, deductions: 150000, net: 850000 },
        rows: [],
      }],
      staffDetails: [],
      skippedSheets: [],
      errors: [],
    },
    rowsReadyForCommit: 1,
    unmatchedRows: [],
    employeeReviews: [{
      reviewKey: 'number:egy-010',
      action: 'create',
      employeeId: 'new-employee-id',
      employeeNumber: 'EGY-010',
      employeeName: 'New Employee',
      companyEmail: 'new@egypro.test',
      startDate: '2026-01-01',
      endDate: null,
      employmentType: 'full_time',
      contractType: 'permanent',
      changes: [],
      reason: 'Create a reviewed employee profile before importing payroll history.',
    }],
    ...overrides,
  }
}

function renderPage(staged: HistoricalPayrollStage) {
  const api: HistoricalPayrollImportApi = {
    stage: vi.fn().mockResolvedValue(staged),
    commit: vi.fn().mockResolvedValue({ batchId: 'batch-1', periods: 1, rows: 1 }),
  }
  render(
    <MemoryRouter>
      <HistoricalPayrollMigrationPage api={api} />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Historical payroll workbook'), {
    target: { files: [new File(['history'], 'history.xlsx')] },
  })
  return api
}

describe('HistoricalPayrollMigrationPage employee review', () => {
  test('requires explicit confirmation before committing reviewed create and enrich actions', async () => {
    const api = renderPage(stage())

    expect(await screen.findByText('Employee profile review')).toBeInTheDocument()
    const commit = screen.getByRole('button', { name: 'Commit history' })
    expect(commit).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: /confirm reviewed employee profile changes/i }))
    expect(commit).toBeEnabled()
    fireEvent.click(commit)

    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(
      expect.any(File),
      expect.any(Object),
      { confirmed: true, resolutions: {} },
    ))
  })

  test('keeps a name-only suggestion unresolved until the operator selects it', async () => {
    renderPage(stage({
      rowsReadyForCommit: 0,
      unmatchedRows: [{
        periodStart: '2026-06-01',
        rowNumber: 2,
        employeeNumber: 'UNKNOWN',
        employeeName: 'Active Person',
        reason: 'Name-only match requires manual review.',
        reviewKey: 'number:unknown',
      }],
      employeeReviews: [{
        reviewKey: 'number:unknown',
        action: 'unresolved',
        employeeId: null,
        employeeNumber: 'UNKNOWN',
        employeeName: 'Active Person',
        companyEmail: null,
        startDate: '2026-06-01',
        endDate: null,
        employmentType: 'full_time',
        contractType: 'permanent',
        changes: [],
        reason: 'Name-only match requires manual review.',
        suggestedEmployeeId: 'employee-1',
        suggestedEmployeeName: 'Active Person',
      }],
    } as Partial<HistoricalPayrollStage>))

    await screen.findByText('Employee profile review')
    const confirm = screen.getByRole('checkbox', { name: /confirm reviewed employee profile changes/i })
    fireEvent.click(confirm)
    expect(screen.getByRole('button', { name: 'Commit history' })).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: /use suggested employee active person/i }))
    expect(screen.getByRole('button', { name: 'Commit history' })).toBeEnabled()
  })
})
