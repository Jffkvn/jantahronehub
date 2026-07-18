import { screen } from '@testing-library/react'
import { expect,test,vi } from 'vitest'
import { renderWithProviders } from '../../../test/render'
import type { TrainingApi } from '../../hr/api/training'
import { MyTrainingPage } from './MyTrainingPage'
test('shows employee training history',async()=>{const api={listMine:vi.fn().mockResolvedValue([{id:crypto.randomUUID(),employeeId:crypto.randomUUID(),employeeNumber:'EGY-1',employeeName:'Amina',topic:'First Aid',provider:'Red Cross',completionDate:'2026-07-18',durationHours:8,costUgx:null,status:'passed',expiryDate:'2027-07-18',certificateReference:'CERT-1',certificateCount:1,createdAt:'2026'}]),listForHr:vi.fn(),save:vi.fn(),update:vi.fn(),listDocuments:vi.fn(),uploadDocuments:vi.fn(),removeDocument:vi.fn(),createDocumentDownload:vi.fn()} as TrainingApi;renderWithProviders(<MyTrainingPage api={api}/>);expect(await screen.findByText('First Aid')).toBeInTheDocument();expect(screen.getByRole('button',{name:/view certificates/i})).toBeInTheDocument()})
