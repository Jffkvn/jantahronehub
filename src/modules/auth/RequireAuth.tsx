import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { status } = useAuth()

  if (status === 'initializing' || status === 'loading_access') {
    return <div className="oh-route-loading" role="status"><span /><p>Verifying access…</p></div>
  }
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  if (status === 'mfa_enrollment_required') return <Navigate to="/mfa/enroll" replace />
  if (status === 'mfa_challenge_required') return <Navigate to="/mfa/challenge" replace />
  if (status === 'access_denied' || status === 'error') return <Navigate to="/forbidden" replace />
  return <Outlet />
}
