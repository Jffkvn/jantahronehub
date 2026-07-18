import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { WalletCards } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Modal } from '../../../components/ui/Modal'
import { staffAdvancesApi, type StaffAdvance, type StaffAdvancesApi } from '../../hr/api/staffAdvances'
import { StaffAdvanceDetails, StaffAdvanceStatus } from '../../hr/components/StaffAdvanceDetails'
import { StaffAdvanceForm } from '../../hr/components/StaffAdvanceForm'
import { PortalHeader } from './shared'

const currency = new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 })
export function MyAdvancesPage({ api = staffAdvancesApi }: { api?: StaffAdvancesApi }) {
  const [requesting, setRequesting] = useState(false); const [selected, setSelected] = useState<StaffAdvance | null>(null); const [params, setParams] = useSearchParams(); const queryClient = useQueryClient()
  const advances = useQuery({ queryKey: ['my-staff-advances'], queryFn: api.listMine })
  const submit = useMutation({ mutationFn: (input: Parameters<StaffAdvancesApi['submit']>[0]) => api.submit(input), onSuccess: async () => { setRequesting(false); await queryClient.invalidateQueries({ queryKey: ['my-staff-advances'] }) } })
  const viewing = selected ?? advances.data?.find((advance) => advance.id === params.get('advance')) ?? null
  const open = (advances.data ?? []).find((advance) => ['pending', 'active', 'flagged'].includes(advance.status))
  const close = () => { setSelected(null); if (params.has('advance')) { const next = new URLSearchParams(params); next.delete('advance'); setParams(next, { replace: true }) } }
  return <>
    <PortalHeader eyebrow="Employee self-service" title="My Staff Advances" description="Request an advance and follow deductions, balances and HR decisions." />
    <div className="oh-page-actions"><Button disabled={Boolean(open)} onClick={() => setRequesting(true)}><WalletCards size={18} /> Request advance</Button></div>
    {advances.isLoading ? <p role="status">Loading staff advances…</p> : null}{advances.isError ? <FormError>Staff advances could not be loaded.</FormError> : null}
    {open ? <div className="oh-kpi-band"><article className="oh-kpi"><span className="oh-kpi__label">Current status</span><strong className="oh-kpi__value"><StaffAdvanceStatus status={open.status} /></strong></article><article className="oh-kpi"><span className="oh-kpi__label">Outstanding balance</span><strong className="oh-kpi__value oh-kpi__value--warning">{currency.format(open.balanceRemaining)}</strong></article><article className="oh-kpi"><span className="oh-kpi__label">Monthly deduction</span><strong className="oh-kpi__value">{currency.format(open.monthlyDeduction)}</strong></article></div> : null}
    <section className="oh-card oh-leave-requests"><h2>Advance history</h2>{advances.data?.length ? <div className="oh-table-wrap"><table className="oh-table"><thead><tr><th>Date</th><th>Reason</th><th>Amount</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{advances.data.map((advance) => <tr key={advance.id}><td>{advance.dateIssued}</td><td>{advance.reason}</td><td>{currency.format(advance.amount)}</td><td>{currency.format(advance.balanceRemaining)}</td><td><StaffAdvanceStatus status={advance.status} /></td><td><Button className="oh-button--small" variant="secondary" onClick={() => setSelected(advance)}>View details</Button></td></tr>)}</tbody></table></div> : <p>No staff advances yet.</p>}</section>
    <Modal open={requesting} title="Request staff advance" onClose={() => setRequesting(false)}><StaffAdvanceForm submitting={submit.isPending} onCancel={() => setRequesting(false)} onSubmit={(value) => submit.mutateAsync(value)} />{submit.isError ? <FormError>{submit.error.message}</FormError> : null}</Modal>
    <Modal open={Boolean(viewing)} title="Staff advance details" onClose={close}>{viewing ? <StaffAdvanceDetails advance={viewing} api={api} /> : null}</Modal>
  </>
}
