import { Navigate, Route, Routes } from 'react-router-dom'

import { ComponentShowcase } from './ComponentShowcase'

function LoginEntry() {
  return (
    <main className="oh-login">
      <section className="oh-login__panel" aria-labelledby="product-name">
        <p className="oh-login__eyebrow">Welcome to</p>
        <h1 id="product-name">Egypro OneHub</h1>
        <p className="oh-login__provider">Powered by JantaHR</p>
      </section>
    </main>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginEntry />} />
      <Route path="/components" element={<ComponentShowcase />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
