import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import PortalPage from './PortalPage'
import type { SelfServiceApi } from './api/selfService'

const profile = {
  id: 'employee-1',
  employeeNumber: 'EGY-001',
  legalName: 'Amina Nsubuga',
  companyEmail: 'amina@egypro.test',
  personalEmail: 'amina.personal@example.test',
  workPhone: '+256700000001',
  active: true,
  departmentName: 'Operations',
  jobTitleName: 'Field Technician',
  startDate: '2025-01-10',
  endDate: null,
  employmentType: 'full_time',
  contractType: 'permanent',
  probationEndDate: null,
  probationStatus: 'passed',
} as const

const visibleDocument = {
  id: 'document-1',
  displayName: 'Employment contract',
  documentType: 'contract',
  mimeType: 'application/pdf',
  sizeBytes: 128000,
  uploadedAt: '2026-07-01T08:00:00Z',
  storagePath:
    '10000000-0000-4000-8000-000000000001/employees/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.pdf',
} as const

function createApi(overrides: Partial<SelfServiceApi> = {}): SelfServiceApi {
  return {
    getProfile: vi.fn().mockResolvedValue(profile),
    listDocuments: vi.fn().mockResolvedValue([visibleDocument]),
    createDocumentDownload: vi
      .fn()
      .mockResolvedValue('https://example.supabase.co/storage/v1/object/sign/private-files/file.pdf'),
    listPayslips: vi.fn().mockResolvedValue([]),
    downloadPayslip: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderPortal({
  api = createApi(),
  initialPath = '/my',
}: {
  api?: SelfServiceApi
  initialPath?: string
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  }

  render(
    <Routes>
      <Route path="/my/*" element={<PortalPage api={api} />} />
    </Routes>,
    { wrapper: Providers },
  )
  return { api }
}

test('shows an employee dashboard from the linked employee record', async () => {
  renderPortal()

  expect(await screen.findByRole('heading', { name: /my workspace/i })).toBeInTheDocument()
  expect(screen.getByText('Amina Nsubuga')).toBeInTheDocument()
  expect(screen.getByText('Field Technician')).toBeInTheDocument()
  expect(screen.getByText('Operations')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/my/profile')
  expect(screen.queryByText(/import \/ export/i)).not.toBeInTheDocument()
})

test('shows the employee profile without HR confidential fields', async () => {
  renderPortal({ initialPath: '/my/profile' })

  expect(await screen.findByRole('heading', { name: /my profile/i })).toBeInTheDocument()
  expect(screen.getAllByText('EGY-001').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('amina@egypro.test').length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('Permanent')).toBeInTheDocument()
  expect(screen.queryByText(/gross monthly salary/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/\bTIN\b/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/\bNSSF\b/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/bank/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/nin|passport/i)).not.toBeInTheDocument()
})

test('lists employee-visible documents and opens a signed download', async () => {
  const user = userEvent.setup()
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  const { api } = renderPortal({ initialPath: '/my/documents' })

  expect(await screen.findByRole('heading', { name: /my documents/i })).toBeInTheDocument()
  expect(screen.getByText('Employment contract')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /download employment contract/i }))

  await waitFor(() => expect(api.createDocumentDownload).toHaveBeenCalledWith(visibleDocument))
  expect(open).toHaveBeenCalledWith(
    'https://example.supabase.co/storage/v1/object/sign/private-files/file.pdf',
    '_blank',
    'noopener,noreferrer',
  )
  open.mockRestore()
})

test('keeps payslips empty until the payroll module creates real records', async () => {
  renderPortal({ initialPath: '/my/payslips' })

  expect(await screen.findByRole('heading', { name: /my payslips/i })).toBeInTheDocument()
  expect(screen.getByText(/no payslips are available yet/i)).toBeInTheDocument()
  expect(screen.queryByText(/demo|sample|mock/i)).not.toBeInTheDocument()
})

test('retries the payslip query after a temporary workspace failure',async()=>{
  const user=userEvent.setup(),listPayslips=vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue([])
  renderPortal({api:createApi({listPayslips})})
  expect(await screen.findByText(/workspace could not be loaded/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/try again/i}))
  await waitFor(()=>expect(listPayslips).toHaveBeenCalledTimes(2))
})
