import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useState } from 'react'
import { renderWithProviders } from '../../../test/render'
import { PayrollLineEditor } from './PayrollLineEditor'
import type { PayrollDraftItem } from '../types'

test('edits percentage worked and can defer an employee from the run', async () => {
  const user = userEvent.setup(); const onChange = vi.fn(); const onDefer = vi.fn()
  function Harness(){const [value,setValue]=useState<PayrollDraftItem>({employeeId:'e1',percentOfMonthWorked:100,overtimeHours:0,lineItems:[]});return <PayrollLineEditor employeeName="Amina" value={value} locked={false} onChange={(next)=>{setValue(next);onChange(next)}} onDefer={onDefer}/>}
  renderWithProviders(<Harness />)
  await user.clear(screen.getByLabelText(/percentage worked/i)); await user.type(screen.getByLabelText(/percentage worked/i), '75')
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({percentOfMonthWorked:75}))
  await user.click(screen.getByRole('button',{name:/defer amina/i})); expect(onDefer).toHaveBeenCalled()
})

test('locks editing after approval', () => {
  renderWithProviders(<PayrollLineEditor employeeName="Amina" value={{employeeId:'e1',percentOfMonthWorked:100,overtimeHours:0,lineItems:[]}} locked onChange={vi.fn()} onDefer={vi.fn()} />)
  expect(screen.getByLabelText(/percentage worked/i)).toBeDisabled(); expect(screen.queryByRole('button',{name:/defer/i})).not.toBeInTheDocument()
})
