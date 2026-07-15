import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FormError } from '../../components/ui/FormError'
import { Modal } from '../../components/ui/Modal'
import { AccessAuditPanel } from './components/AccessAuditPanel'
import {
  UserAccessForm,
  type UserAccessFormValues,
} from './components/UserAccessForm'
import { UserAccountsList } from './components/UserAccountsList'
import {
  userAdministrationApi,
  type RoleKey,
  type UserAccount,
  type UserAdministrationApi,
} from './api/users'

type StatusFilter = 'all' | 'active' | 'deactivated'
type LinkFilter = 'all' | 'linked' | 'unlinked'

const privilegedRoles = new Set<RoleKey>([
  'super_admin',
  'hr_admin',
  'cfo',
  'managing_director',
])
const emptyAccounts: UserAccount[] = []

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'User administration request could not be completed.'
}

export function AdminPage({
  api = userAdministrationApi,
}: {
  api?: UserAdministrationApi
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | RoleKey>('all')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [connectOpen, setConnectOpen] = useState(false)
  const [editing, setEditing] = useState<UserAccount | null>(null)
  const [changingStatus, setChangingStatus] = useState<UserAccount | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusReasonError, setStatusReasonError] = useState('')

  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.listUsers,
  })
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: api.listRoles,
  })
  const employees = useQuery({
    queryKey: ['admin', 'employees'],
    queryFn: api.listEmployees,
  })
  const audit = useQuery({
    queryKey: ['admin', 'access-audit'],
    queryFn: () => api.listAudit(50),
  })

  async function refreshAdministration() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'access-audit'] }),
    ])
  }

  const connect = useMutation({
    mutationFn: api.connectUser,
    onSuccess: async () => {
      setConnectOpen(false)
      await refreshAdministration()
    },
  })
  const update = useMutation({
    mutationFn: api.updateAccess,
    onSuccess: async () => {
      setEditing(null)
      await refreshAdministration()
    },
  })
  const setStatus = useMutation({
    mutationFn: api.setStatus,
    onSuccess: async () => {
      setChangingStatus(null)
      setStatusReason('')
      setStatusReasonError('')
      await refreshAdministration()
    },
  })

  const accounts = users.data ?? emptyAccounts
  const metrics = useMemo(
    () => ({
      active: accounts.filter((account) => account.status === 'active').length,
      deactivated: accounts.filter(
        (account) => account.status === 'deactivated',
      ).length,
      unlinked: accounts.filter((account) => !account.employee).length,
      privileged: accounts.filter((account) =>
        account.roleKeys.some((roleKey) => privilegedRoles.has(roleKey)),
      ).length,
    }),
    [accounts],
  )

  const availableRoleKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...(roles.data ?? []).map((role) => role.key),
          ...accounts.flatMap((account) => account.roleKeys),
        ]),
      ).sort(),
    [accounts, roles.data],
  )

  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return accounts.filter((account) => {
      const matchesSearch =
        !needle ||
        [
          account.displayName,
          account.email,
          account.employee?.legalName,
          account.employee?.employeeNumber,
          ...account.roleKeys,
        ].some((value) => value?.toLowerCase().includes(needle))
      const matchesStatus =
        statusFilter === 'all' || account.status === statusFilter
      const matchesRole =
        roleFilter === 'all' || account.roleKeys.includes(roleFilter)
      const matchesLink =
        linkFilter === 'all' ||
        (linkFilter === 'linked' ? account.employee !== null : account.employee === null)
      return matchesSearch && matchesStatus && matchesRole && matchesLink
    })
  }, [accounts, linkFilter, roleFilter, search, statusFilter])

  async function connectAccount(values: UserAccessFormValues) {
    await connect.mutateAsync(values)
  }

  async function updateAccount(values: UserAccessFormValues) {
    if (!editing) return
    await update.mutateAsync({
      profileId: editing.profileId,
      displayName: values.displayName,
      roleKeys: values.roleKeys,
      employeeId: values.employeeId,
      reason: values.reason,
    })
  }

  async function confirmStatusChange() {
    if (!changingStatus) return
    const normalizedReason = statusReason.trim()
    if (normalizedReason.length < 3) {
      setStatusReasonError('Reason must contain at least 3 characters.')
      return
    }
    setStatusReasonError('')
    await setStatus.mutateAsync({
      profileId: changingStatus.profileId,
      status: changingStatus.status === 'active' ? 'deactivated' : 'active',
      reason: normalizedReason,
    })
  }

  const supportDataUnavailable = roles.isError || employees.isError

  return (
    <section className="oh-workspace-page oh-admin-page">
      <header className="oh-page-header">
        <div>
          <p>System administration</p>
          <h1>User &amp; access administration</h1>
          <span>
            Connect login accounts, assign roles, and preserve a complete access trail.
          </span>
        </div>
        <div className="oh-dossier-actions">
          <Button
            variant="secondary"
            onClick={() => void refreshAdministration()}
            loading={users.isFetching}
          >
            <RefreshCw size={17} aria-hidden="true" /> Refresh
          </Button>
          <Button
            onClick={() => {
              connect.reset()
              setConnectOpen(true)
            }}
            disabled={supportDataUnavailable || roles.isLoading || employees.isLoading}
          >
            <UserPlus size={17} aria-hidden="true" /> Connect Auth user
          </Button>
        </div>
      </header>

      <aside className="oh-admin-guidance" aria-label="Current account setup process">
        <ShieldCheck size={21} aria-hidden="true" />
        <div>
          <strong>Secure testing flow</strong>
          <p>
            First create the person's login in Supabase Auth, then connect the exact email here.
            OneHub never asks for or displays their password.
          </p>
        </div>
      </aside>

      <section className="oh-kpi-band" aria-label="User account summary">
        <article className="oh-kpi" aria-label="Active accounts">
          <span className="oh-kpi__label">Active accounts</span>
          <strong className="oh-kpi__value oh-kpi__value--success">{metrics.active}</strong>
        </article>
        <article className="oh-kpi" aria-label="Deactivated accounts">
          <span className="oh-kpi__label">Deactivated</span>
          <strong className="oh-kpi__value">{metrics.deactivated}</strong>
        </article>
        <article className="oh-kpi" aria-label="Unlinked accounts">
          <span className="oh-kpi__label">Without employee link</span>
          <strong className="oh-kpi__value oh-kpi__value--warning">{metrics.unlinked}</strong>
        </article>
        <article className="oh-kpi" aria-label="Privileged accounts">
          <span className="oh-kpi__label">Privileged roles</span>
          <strong className="oh-kpi__value">{metrics.privileged}</strong>
        </article>
      </section>

      <section className="oh-section-surface">
        <header className="oh-section-header">
          <div>
            <h2><Users size={18} aria-hidden="true" /> User accounts</h2>
            <p>Search and review current role, employee link, and account status.</p>
          </div>
          <span className="oh-record-count">
            {filteredAccounts.length} of {accounts.length} accounts
          </span>
        </header>

        <div className="oh-admin-filters">
          <label className="oh-search">
            <KeyRound size={18} aria-hidden="true" />
            <span className="oh-sr-only">Search user accounts</span>
            <input
              type="search"
              aria-label="Search user accounts"
              placeholder="Search name, email, employee, or role"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="oh-compact-field">
            <span>Account status</span>
            <select
              aria-label="Account status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </label>
          <label className="oh-compact-field">
            <span>Role</span>
            <select
              aria-label="Account role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as 'all' | RoleKey)}
            >
              <option value="all">All roles</option>
              {availableRoleKeys.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {roleKey.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="oh-compact-field">
            <span>Employee link</span>
            <select
              aria-label="Employee link"
              value={linkFilter}
              onChange={(event) => setLinkFilter(event.target.value as LinkFilter)}
            >
              <option value="all">All links</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Unlinked</option>
            </select>
          </label>
        </div>

        {users.isLoading ? (
          <p role="status" className="oh-muted-message">Loading user accounts…</p>
        ) : users.isError ? (
          <EmptyState
            icon={<Link2 />}
            title="User accounts could not be loaded"
            description="Try again. If the problem continues, confirm this account has user administration access."
            action={
              <Button variant="secondary" onClick={() => void users.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <UserAccountsList
            accounts={filteredAccounts}
            onEdit={(account) => {
              update.reset()
              setEditing(account)
            }}
            onStatus={(account) => {
              setStatus.reset()
              setStatusReason('')
              setStatusReasonError('')
              setChangingStatus(account)
            }}
          />
        )}
      </section>

      <AccessAuditPanel entries={audit.data ?? []} />

      <Modal
        open={connectOpen}
        title="Connect existing Auth user"
        onClose={() => setConnectOpen(false)}
      >
        <p className="oh-modal-intro">
          The email must already exist under Authentication → Users in the designated Supabase project.
        </p>
        <UserAccessForm
          mode="connect"
          roles={roles.data ?? []}
          employees={employees.data ?? []}
          submitting={connect.isPending}
          submitError={connect.isError ? errorMessage(connect.error) : undefined}
          onSubmit={connectAccount}
          onCancel={() => setConnectOpen(false)}
        />
      </Modal>

      <Modal
        open={editing !== null}
        title={editing ? `Edit access · ${editing.displayName}` : 'Edit access'}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <UserAccessForm
            mode="edit"
            roles={roles.data ?? []}
            employees={employees.data ?? []}
            initialValues={{
              email: editing.email,
              displayName: editing.displayName,
              roleKeys: editing.roleKeys,
              employeeId: editing.employee?.id ?? null,
            }}
            submitting={update.isPending}
            submitError={update.isError ? errorMessage(update.error) : undefined}
            onSubmit={updateAccount}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={changingStatus !== null}
        title={
          changingStatus?.status === 'active'
            ? 'Deactivate account'
            : 'Reactivate account'
        }
        onClose={() => setChangingStatus(null)}
      >
        {changingStatus ? (
          <div className="oh-status-confirmation">
            <p>
              {changingStatus.status === 'active'
                ? `${changingStatus.displayName} will immediately lose OneHub access.`
                : `${changingStatus.displayName} will regain the permissions assigned to their roles.`}
            </p>
            <label className="oh-field">
              <span className="oh-field__label">Reason for status change *</span>
              <textarea
                className="oh-input oh-textarea"
                rows={3}
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
              {statusReasonError ? <FormError>{statusReasonError}</FormError> : null}
            </label>
            {setStatus.isError ? <FormError>{errorMessage(setStatus.error)}</FormError> : null}
            <div className="oh-form-actions">
              <Button variant="secondary" onClick={() => setChangingStatus(null)}>
                Cancel
              </Button>
              <Button
                variant={changingStatus.status === 'active' ? 'danger' : 'primary'}
                loading={setStatus.isPending}
                onClick={() => void confirmStatusChange()}
              >
                {changingStatus.status === 'active' ? 'Deactivate account' : 'Reactivate account'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}

export default AdminPage
