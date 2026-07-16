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
      <Route path="/projects" element={<ProjectsListPage />} />
      <Route path="/projects/new" element={<CreateProjectPage />} />
      <Route path="/projects/:projectId/summary" element={<ProjectRoute tab="summary" />} />
      <Route path="/projects/:projectId/team" element={<ProjectRoute tab="team" />} />
      <Route path="/projects/:projectId/updates" element={<ProjectRoute tab="updates" />} />
      <Route path="/projects/:projectId/cash" element={<ProjectRoute tab="cash" />} />
      <Route path="/projects/:projectId/inventory" element={<ProjectRoute tab="inventory" />} />
      <Route path="/projects/:projectId/documents" element={<ProjectRoute tab="documents" />} />
      <Route path="/projects/:projectId/history" element={<ProjectRoute tab="history" />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}
