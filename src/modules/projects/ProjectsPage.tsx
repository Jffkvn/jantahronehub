import { Navigate, Route, Routes } from 'react-router-dom'

function Placeholder({ heading }: { heading: string }) {
  return (
    <section className="oh-page">
      <div className="oh-page-header">
        <div>
          <p className="oh-page-eyebrow">Projects</p>
          <h1>{heading}</h1>
        </div>
      </div>
    </section>
  )
}

export default function ProjectsPage() {
  return (
    <Routes>
      <Route path="/projects" element={<Placeholder heading="Projects directory" />} />
      <Route path="/projects/new" element={<Placeholder heading="Create project" />} />
      <Route path="/projects/:projectId/summary" element={<Placeholder heading="Project summary" />} />
      <Route path="/projects/:projectId/team" element={<Placeholder heading="Project team" />} />
      <Route path="/projects/:projectId/updates" element={<Placeholder heading="Daily updates" />} />
      <Route path="/projects/:projectId/cash" element={<Placeholder heading="Project cash" />} />
      <Route path="/projects/:projectId/inventory" element={<Placeholder heading="Inventory & equipment" />} />
      <Route path="/projects/:projectId/documents" element={<Placeholder heading="Project documents" />} />
      <Route path="/projects/:projectId/history" element={<Placeholder heading="Project history" />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  )
}
