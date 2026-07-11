import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { selfServiceApi, type SelfServiceApi } from './api/selfService'
import { MyDashboardPage } from './pages/MyDashboardPage'
import { MyDocumentsPage } from './pages/MyDocumentsPage'
import { MyPayslipsPage } from './pages/MyPayslipsPage'
import { MyProfilePage } from './pages/MyProfilePage'
import { PortalNav } from './pages/shared'

export default function PortalPage({ api = selfServiceApi }: { api?: SelfServiceApi }) {
  const profile = useQuery({
    queryKey: ['self-service-profile'],
    queryFn: api.getProfile,
  })
  const documents = useQuery({
    queryKey: ['self-service-documents'],
    queryFn: api.listDocuments,
  })

  if (profile.isLoading) {
    return (
      <section className="oh-workspace-page">
        <p role="status">Loading your workspace...</p>
      </section>
    )
  }

  if (profile.isError || documents.isError) {
    return (
      <section className="oh-workspace-page">
        <EmptyState
          icon={<AlertTriangle />}
          title="Your workspace could not be loaded"
          description="Try again or contact the OneHub administrator."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void profile.refetch()
                void documents.refetch()
              }}
            >
              Try again
            </Button>
          }
        />
      </section>
    )
  }

  return (
    <section className="oh-workspace-page">
      <PortalNav />
      <Routes>
        <Route index element={<MyDashboardPage profile={profile.data ?? null} />} />
        <Route path="profile" element={<MyProfilePage profile={profile.data ?? null} />} />
        <Route
          path="documents"
          element={
            <MyDocumentsPage
              api={api}
              profile={profile.data ?? null}
              documents={documents.data ?? []}
            />
          }
        />
        <Route path="payslips" element={<MyPayslipsPage />} />
        <Route path="*" element={<Navigate to="/my" replace />} />
      </Routes>
    </section>
  )
}
