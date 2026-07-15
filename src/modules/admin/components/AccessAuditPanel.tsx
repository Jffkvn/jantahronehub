import { History } from 'lucide-react'

import type { AccessAuditEntry } from '../api/users'

const eventLabels: Record<AccessAuditEntry['eventType'], string> = {
  'user.connected': 'Account connected',
  'user.access_updated': 'Access updated',
  'user.status_changed': 'Account status changed',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function AccessAuditPanel({ entries }: { entries: AccessAuditEntry[] }) {
  return (
    <section className="oh-section-surface oh-access-audit">
      <header className="oh-section-header">
        <div>
          <h2>
            <History size={18} aria-hidden="true" /> Recent access changes
          </h2>
          <p>Who changed access, what changed, and the reason recorded.</p>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="oh-muted-message">Access changes will appear here.</p>
      ) : (
        <ol className="oh-audit-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="oh-audit-list__marker" aria-hidden="true" />
              <div>
                <strong>{eventLabels[entry.eventType]}</strong>
                <p>
                  {entry.actorDisplayName ?? 'System'} changed{' '}
                  {entry.targetDisplayName ?? 'a user account'}.
                </p>
                {entry.reason ? <blockquote>{entry.reason}</blockquote> : null}
                <time dateTime={entry.occurredAt}>
                  {formatDate(entry.occurredAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
