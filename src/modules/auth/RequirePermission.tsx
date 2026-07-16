import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from './AuthProvider'

export function RequirePermission({
  permission,
  allOf,
  anyOf,
}: {
  permission?: string
  allOf?: string[]
  anyOf?: string[]
}) {
  const { status, access } = useAuth()
  if (status === 'initializing' || status === 'loading_access') {
    return <div className="oh-route-loading" role="status"><span /><p>Checking permissions…</p></div>
  }
  const required = allOf ?? (permission ? [permission] : [])
  const accepted = anyOf ?? []
  const allowed =
    status === 'authenticated' &&
    required.every((key) => access?.permissionKeys.includes(key)) &&
    (!accepted.length || accepted.some((key) => access?.permissionKeys.includes(key)))
  return allowed ? <Outlet /> : <Navigate to="/forbidden" replace />
}
