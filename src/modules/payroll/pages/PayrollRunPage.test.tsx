import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { renderWithProviders } from '../../../test/render'
import type { PayrollApi } from '../api/payroll'
import { approvedRun } from '../fixtures/approvedRun'
import { PayrollRunPage } from './PayrollRunPage'

function createApi(run=approvedRun):PayrollApi{return {list:vi.fn(),get:vi.fn().mockResolvedValue(run),eligibleEmployees:vi.fn().mockResolvedValue([]),create:vi.fn(),replace:vi.fn(),approve:vi.fn(),amend:vi.fn(),recordPayment:vi.fn().mockResolvedValue('payment-1'),recordExport:vi.fn()}}

test('approved payroll is locked and CFO records payment without replacing payroll',async()=>{
  const user=userEvent.setup(),api=createApi(); renderWithProviders(<PayrollRunPage runId="run-1" api={api} permissions={['payroll.read','payroll.record_payment','payroll.export']} />)
  expect((await screen.findAllByText(/approved and locked/i)).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button',{name:/save draft/i})).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/record payment/i})); fireEvent.change(screen.getByLabelText(/payment reference/i),{target:{value:'CFO-2026-001'}}); await user.click(screen.getByRole('button',{name:/confirm payment/i}))
  await waitFor(()=>expect(api.recordPayment).toHaveBeenCalledWith('run-1',expect.objectContaining({reference:'CFO-2026-001'})))
  expect(api.replace).not.toHaveBeenCalled()
})

test('blocks approval while draft edits are unsaved and visibly defers employees',async()=>{
  const user=userEvent.setup(),draftRun={...approvedRun,status:'draft' as const,approvedAt:null},api=createApi(draftRun)
  renderWithProviders(<PayrollRunPage runId="run-1" api={api} permissions={['payroll.read','payroll.prepare','payroll.approve']} />)
  const percentage=await screen.findByLabelText(/percentage worked for amina/i)
  fireEvent.change(percentage,{target:{value:'75'}})
  expect(screen.getByRole('button',{name:/approve payroll/i})).toBeDisabled()
  expect(screen.getByText(/save changes before approval/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/defer amina/i}))
  expect(screen.queryByText('Amina Nsubuga')).not.toBeInTheDocument()
  expect(screen.getByText(/1 employee deferred/i)).toBeInTheDocument()
})
