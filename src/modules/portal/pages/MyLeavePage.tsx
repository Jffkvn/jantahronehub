import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Modal } from '../../../components/ui/Modal'
import { leaveApi, type LeaveApi } from '../../hr/api/leave'
import { LeaveBalanceCards } from '../../hr/components/LeaveBalanceCards'
import { LeaveCalendar } from '../../hr/components/LeaveCalendar'
import { LeaveRequestForm } from '../../hr/components/LeaveRequestForm'
import { LeaveRequestDetails } from '../../hr/components/LeaveRequestDetails'
import { LeaveStatusBadge } from '../../hr/components/LeaveStatusBadge'
import { PortalHeader } from './shared'

export function MyLeavePage({ employeeId, api = leaveApi }: { employeeId: string; api?: LeaveApi }) {
  const [requesting, setRequesting] = useState(false)
  const [selectedRequest, setViewing] = useState<Awaited<ReturnType<LeaveApi['listMine']>>[number] | null>(null)
  const [withdrawing, setWithdrawing] = useState<Awaited<ReturnType<LeaveApi['listMine']>>[number] | null>(null)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const year = new Date().getFullYear()
  const types = useQuery({ queryKey: ['leave-types'], queryFn: api.listTypes })
  const requests = useQuery({ queryKey: ['my-leave-requests'], queryFn: api.listMine })
  const balances = useQuery({ queryKey: ['leave-balances', employeeId, year], queryFn: () => api.listBalances(employeeId, year) })
  const submit = useMutation({
    mutationFn: async (values: Parameters<LeaveApi['submit']>[0] & { files: File[] }) => {
      const requestId = await api.submit(values)
      if (values.files.length) {
        try {
          await api.uploadDocuments(requestId, values.files)
        } catch (error) {
          try {
            await api.withdraw({ requestId, reason: 'Supporting document upload failed; request withdrawn automatically.' })
          } catch {
            // Preserve the upload error shown to the employee.
          }
          throw error
        }
      }
    },
    onSuccess: async () => {
      setRequesting(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-leave-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['leave-balances', employeeId, year] }),
      ])
    },
  })
  const withdraw = useMutation({
    mutationFn: () => {
      if (!withdrawing) throw new Error('Select a leave request.')
      return api.withdraw({ requestId: withdrawing.id, reason: withdrawalReason })
    },
    onSuccess: async () => {
      setWithdrawing(null)
      setWithdrawalReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-leave-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['leave-balances', employeeId, year] }),
      ])
    },
  })

  const loading = types.isLoading || requests.isLoading || balances.isLoading
  const failed = types.isError || requests.isError || balances.isError
  const viewing = selectedRequest ?? requests.data?.find((request) => request.id === searchParams.get('request')) ?? null

  const closeDetails = () => {
    setViewing(null)
    if (searchParams.has('request')) {
      const next = new URLSearchParams(searchParams)
      next.delete('request')
      setSearchParams(next, { replace: true })
    }
  }

  return <>
    <PortalHeader eyebrow="Employee self-service" title="My Leave" description="Request whole-day leave, check balances and follow every decision." />
    <div className="oh-page-actions"><Button onClick={() => setRequesting(true)}><CalendarPlus size={18} /> Request leave</Button></div>
    {loading ? <p role="status">Loading leave records…</p> : null}
    {failed ? <FormError>Leave records could not be loaded.</FormError> : null}
    <LeaveBalanceCards balances={balances.data ?? []} />
    <LeaveCalendar requests={requests.data ?? []} />
    <section className="oh-card oh-leave-requests"><h2>My requests</h2>{requests.data?.length ? <div className="oh-table-wrap"><table className="oh-table"><thead><tr><th>Leave</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{requests.data.map((request) => <tr key={request.id}><td>{request.leaveTypeName}</td><td>{request.startDate} to {request.endDate}</td><td>{request.workingDays}</td><td>{request.reason}</td><td><LeaveStatusBadge status={request.status} /></td><td><div className="oh-inline-actions"><Button className="oh-button--small" variant="secondary" onClick={() => setViewing(request)}>View details</Button>{request.status === 'pending' ? <Button className="oh-button--small" variant="secondary" aria-label={`Withdraw ${request.leaveTypeName}`} onClick={() => setWithdrawing(request)}>Withdraw</Button> : null}</div></td></tr>)}</tbody></table></div> : <p>No leave requests yet.</p>}</section>
    <Modal open={requesting} title="Request leave" onClose={() => setRequesting(false)}><LeaveRequestForm leaveTypes={types.data ?? []} submitting={submit.isPending} onCancel={() => setRequesting(false)} onSubmit={async (values) => submit.mutateAsync(values)} />{submit.isError ? <FormError>{submit.error.message}</FormError> : null}</Modal>
    <Modal open={Boolean(viewing)} title="Leave request details" onClose={closeDetails}>{viewing ? <LeaveRequestDetails request={viewing} api={api} showHistory={false} /> : null}</Modal>
    <Modal open={Boolean(withdrawing)} title="Withdraw leave request" onClose={() => setWithdrawing(null)}><label className="oh-field"><span className="oh-field__label">Reason for withdrawal</span><textarea className="oh-input oh-textarea" value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} /></label><div className="oh-form-actions"><Button variant="secondary" onClick={() => setWithdrawing(null)}>Keep request</Button><Button variant="danger" disabled={withdrawalReason.trim().length < 3} loading={withdraw.isPending} onClick={() => withdraw.mutate()}>Confirm withdrawal</Button></div>{withdraw.isError ? <FormError>{withdraw.error.message}</FormError> : null}</Modal>
  </>
}
