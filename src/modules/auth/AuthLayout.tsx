import type { ReactNode } from 'react'

export function AuthLayout({ eyebrow, title, description, children }: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="oh-auth-page">
      <section className="oh-auth-card" aria-labelledby="auth-title">
        <div className="oh-auth-brand">
          <span className="oh-brand__mark" aria-hidden="true"><span /><span /><span /></span>
          <span><strong>Egypro OneHub</strong><small>Powered by JantaHR</small></span>
        </div>
        <p className="oh-auth-eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="oh-auth-description">{description}</p>
        {children}
      </section>
    </main>
  )
}
