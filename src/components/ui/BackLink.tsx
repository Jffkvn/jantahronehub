import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="oh-back-link" to={to}>
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </Link>
  )
}
