import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AdvanceDetailPage } from './AdvanceDetailPage'

const cashMocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  getExpenses: vi.fn(),
  getReturns: vi.fn(),
  getBalance: vi.fn(),
  checkOutstandingAdvances: vi.fn(),
}))

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    access: {
      permissionKeys: ['cash_advances.manage'],
      profile: { id: 'profile-1' },
    },
  }),
}))

vi.mock('../api/cash', () => ({
  cashApi: {
    ...cashMocks,
    approveAdvance: vi.fn(),
    disburseAdvance: vi.fn(),
    submitExpense: vi.fn(),
    reviewExpense: vi.fn(),
    recordReturn: vi.fn(),
    closeAdvance: vi.fn(),
  },
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <MemoryRouter initialEntries={['/cash/advances/advance-1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/cash/advances/:advanceId" element={<AdvanceDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AdvanceDetailPage visual hierarchy', () => {
  it('uses shared page, KPI and responsive section surfaces', async () => {
    cashMocks.getRequest.mockResolvedValue({
      id: 'advance-1',
      project_id: 'project-1',
      user_id: 'profile-1',
      amount_requested: 2_000_000,
      purpose: 'Field mobilisation',
      status: 'disbursed',
      requested_at: '2026-07-01T08:00:00Z',
      entered_by: 'profile-1',
      approved_by: 'cfo-1',
      approved_at: '2026-07-01T09:00:00Z',
      disbursed_by: 'cfo-1',
      disbursed_at: '2026-07-01T10:00:00Z',
      amount_disbursed: 2_000_000,
      disbursement_reference: 'MM-1001',
      closed_by: null,
      closed_at: null,
      override_reason: null,
      created_at: '2026-07-01T08:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
      projects: { name: 'Kampala rollout' },
      profiles_user: { display_name: 'Moses Okello' },
      profiles_entered_by: { display_name: 'Moses Okello' },
      profiles_approved_by: { display_name: 'CFO User' },
      profiles_disbursed_by: { display_name: 'CFO User' },
    })
    cashMocks.getExpenses.mockResolvedValue([])
    cashMocks.getReturns.mockResolvedValue([])
    cashMocks.getBalance.mockResolvedValue(2_000_000)
    cashMocks.checkOutstandingAdvances.mockResolvedValue(false)

    const { container } = renderPage()

    expect(await screen.findByRole('heading', { name: 'Advance accountability' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Cash advances' })).toHaveAttribute(
      'href',
      '/cash/advances',
    )
    expect(screen.getByLabelText('Cash reconciliation')).toHaveClass('oh-kpi-band')
    expect(screen.getByRole('heading', { name: 'Request profile' }).closest('section')).toHaveClass(
      'oh-section-surface',
    )
    expect(screen.getByRole('heading', { name: 'Workflow actions' }).closest('section')).toHaveClass(
      'oh-section-surface',
    )
    expect(container.querySelector('.oh-operational-split')).toBeInTheDocument()
    expect(container.querySelector('.oh-dossier-grid')).toBeInTheDocument()
  })
})
