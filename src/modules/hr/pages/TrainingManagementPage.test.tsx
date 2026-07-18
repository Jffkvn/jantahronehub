import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderWithProviders } from '../../../test/render'
import type { TrainingApi } from '../api/training'
import { TrainingManagementPage } from './TrainingManagementPage'

test('shows legacy training KPIs and the HR log action', async () => {
  const api:TrainingApi={listForHr:vi.fn().mockResolvedValue([{id:crypto.randomUUID(),employeeId:crypto.randomUUID(),employeeNumber:'EGY-1',employeeName:'Amina',topic:'Fire Safety',provider:'Red Cross',completionDate:'2026-07-18',durationHours:4,costUgx:100000,status:'passed',expiryDate:'2026-08-01',certificateReference:'CERT-1',certificateCount:1,createdAt:'2026-07-18'}]),listMine:vi.fn(),save:vi.fn(),update:vi.fn(),listDocuments:vi.fn(),uploadDocuments:vi.fn(),removeDocument:vi.fn(),createDocumentDownload:vi.fn()}
  renderWithProviders(<TrainingManagementPage api={api} employeesApi={{list:vi.fn().mockResolvedValue([])} as never}/>)
  expect(await screen.findByRole('heading',{name:/training & certifications/i})).toBeInTheDocument()
  expect(await screen.findByText('Fire Safety')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/log training/i})).toBeInTheDocument()
})
