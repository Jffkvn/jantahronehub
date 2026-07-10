import { ArrowUpRight, Building2, ShieldCheck, Sparkles } from 'lucide-react'

import { formatKampalaDate } from '../../lib/date/formatKampalaDate'

export default function HomePage() {
  return (
    <div className="oh-dashboard-intro">
      <section className="oh-dashboard-hero" aria-labelledby="workspace-heading">
        <div>
          <p className="oh-dashboard-hero__eyebrow">{formatKampalaDate()}</p>
          <h2 id="workspace-heading">Your OneHub workspace</h2>
          <p>
            A single, secure place for Egypro’s people, projects, inventory, and
            financial operations.
          </p>
        </div>
        <div className="oh-dashboard-hero__seal">
          <ShieldCheck size={22} aria-hidden="true" />
          <span>
            <strong>Secure foundation</strong>
            <small>Role-aware access</small>
          </span>
        </div>
      </section>

      <section className="oh-dashboard-grid" aria-label="Workspace status">
        <article className="oh-dashboard-card oh-dashboard-card--primary">
          <span className="oh-dashboard-card__icon"><Building2 size={20} /></span>
          <div>
            <p>Company workspace</p>
            <h3>Egypro Uganda</h3>
            <span>Core operational shell is ready</span>
          </div>
          <ArrowUpRight size={19} aria-hidden="true" />
        </article>
        <article className="oh-dashboard-card">
          <span className="oh-dashboard-card__icon"><Sparkles size={20} /></span>
          <div>
            <p>Current build stage</p>
            <h3>Platform foundation</h3>
            <span>Operational modules will arrive in verified phases</span>
          </div>
        </article>
      </section>

      <section className="oh-dashboard-note">
        <span aria-hidden="true">01</span>
        <div>
          <p className="oh-dashboard-note__label">One system, clear responsibilities</p>
          <h3>Only the tools relevant to your role appear in your workspace.</h3>
          <p>
            Navigation is now modular and responsive. Actual employee, payroll,
            warehouse, and cash records will replace this foundation message as
            each tested module is completed.
          </p>
        </div>
      </section>
    </div>
  )
}
