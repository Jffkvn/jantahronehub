import type { LeaveBalance } from '../api/leave'

export function LeaveBalanceCards({ balances }: { balances: LeaveBalance[] }) {
  return <div className="oh-leave-balance-grid">{balances.map((balance) => <article className="oh-card oh-leave-balance" key={balance.leaveTypeId}><span>{balance.leaveTypeName}</span><strong>{balance.remainingDays}</strong><small>{balance.isPaid ? `${balance.usedDays} used of ${balance.entitledDays + balance.adjustmentDays}` : 'Unpaid leave'}</small></article>)}</div>
}
