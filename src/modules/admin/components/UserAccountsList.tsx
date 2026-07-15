import { LockKeyhole, UserRoundCheck, UserRoundX } from 'lucide-react'

import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { roleLabels } from '../../../config/modules'
import type { UserAccount } from '../api/users'

function formatDate(value: string | null) {
  if (!value) return 'No access changes yet'
  return new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function UserAccountsList({
  accounts,
  onEdit,
  onStatus,
}: {
  accounts: UserAccount[]
  onEdit: (account: UserAccount) => void
  onStatus: (account: UserAccount) => void
}) {
  return (
    <div className="oh-table-wrap">
      <table className="oh-table oh-responsive-table oh-user-table">
        <caption>OneHub user access directory</caption>
        <thead>
          <tr>
            <th scope="col">User account</th>
            <th scope="col">Roles</th>
            <th scope="col">Employee link</th>
            <th scope="col">Status</th>
            <th scope="col">Last access change</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 ? (
            <tr>
              <td className="oh-table__empty" colSpan={6}>
                No accounts match the selected filters.
              </td>
            </tr>
          ) : (
            accounts.map((account) => (
              <tr key={account.profileId}>
                <td data-label="User account">
                  <div className="oh-person-cell">
                    <strong>{account.displayName}</strong>
                    <span>{account.email}</span>
                  </div>
                </td>
                <td data-label="Roles">
                  <div className="oh-user-role-list">
                    {account.roleKeys.map((roleKey) => (
                      <StatusBadge key={roleKey} tone={roleKey === 'super_admin' ? 'info' : 'neutral'}>
                        {roleLabels[roleKey]}
                      </StatusBadge>
                    ))}
                  </div>
                </td>
                <td data-label="Employee link">
                  {account.employee ? (
                    <div className="oh-person-cell">
                      <strong>{account.employee.legalName}</strong>
                      <span>{account.employee.employeeNumber}</span>
                    </div>
                  ) : (
                    <StatusBadge tone="warning">Unlinked</StatusBadge>
                  )}
                </td>
                <td data-label="Status">
                  <StatusBadge tone={account.status === 'active' ? 'success' : 'danger'}>
                    {account.status === 'active' ? 'Active' : 'Deactivated'}
                  </StatusBadge>
                </td>
                <td data-label="Last access change">
                  <span className="oh-secondary-text">
                    {formatDate(account.lastAccessChangeAt)}
                  </span>
                </td>
                <td data-label="Actions">
                  {account.canManage ? (
                    <div className="oh-row-actions">
                      <Button
                        variant="ghost"
                        onClick={() => onEdit(account)}
                        aria-label={`Edit access for ${account.displayName}`}
                      >
                        Edit access
                      </Button>
                      <Button
                        variant={account.status === 'active' ? 'ghost' : 'secondary'}
                        onClick={() => onStatus(account)}
                        aria-label={`${account.status === 'active' ? 'Deactivate' : 'Reactivate'} ${account.displayName}`}
                      >
                        {account.status === 'active' ? (
                          <UserRoundX size={16} aria-hidden="true" />
                        ) : (
                          <UserRoundCheck size={16} aria-hidden="true" />
                        )}
                        {account.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  ) : (
                    <span className="oh-protected-label">
                      <LockKeyhole size={15} aria-hidden="true" /> Protected
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
