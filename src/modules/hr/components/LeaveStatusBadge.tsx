import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import type { LeaveRequest } from '../api/leave'

const tones: Record<LeaveRequest['status'], StatusTone> = { pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'neutral', cancelled: 'neutral' }
export function LeaveStatusBadge({ status }: { status: LeaveRequest['status'] }) { return <StatusBadge tone={tones[status]}>{status.replace('_', ' ')}</StatusBadge> }
