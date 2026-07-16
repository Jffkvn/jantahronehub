import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import { CreateProjectPage } from './pages/CreateProjectPage'
import { ProjectsListPage } from './pages/ProjectsListPage'
import { ProjectWorkspacePage, type ProjectWorkspaceTab } from './pages/ProjectWorkspacePage'

function ProjectRoute({ tab }: { tab: ProjectWorkspaceTab }) {
  const { projectId } = useParams()
  return projectId ? <ProjectWorkspacePage projectId={projectId} activeTab={tab} /> : <Navigate to="/projects" replace />
}

export default function ProjectsPage() {
  return (
    <Routes>
      <Route index element={<ProjectsListPage />} />
      <Route path="new" element={<CreateProjectPage />} />
      <Route path=":projectId/summary" element={<ProjectRoute tab="summary" />} />
      <Route path=":projectId/team" element={<ProjectRoute tab="team" />} />
      <Route path=":projectId/updates" element={<ProjectRoute tab="updates" />} />
      <Route path=":projectId/cash" element={<ProjectRoute tab="cash" />} />
      <Route path=":projectId/inventory" element={<ProjectRoute tab="inventory" />} />
      <Route path=":projectId/documents" element={<ProjectRoute tab="documents" />} />
      <Route path=":projectId/history" element={<ProjectRoute tab="history" />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}
