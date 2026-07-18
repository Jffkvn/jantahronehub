import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface ActivityItem {
  id: string
  title: string
  detail?: string
  timestamp?: string
  icon?: ReactNode
  to?: string
}

export interface ActivityListProps {
  items: ActivityItem[]
  emptyMessage?: string
}

function ActivityContent({ title, detail, timestamp, icon, to }: ActivityItem) {
  return (
    <>
      {icon ? <span className="oh-activity-list__icon">{icon}</span> : null}
      <span className="oh-activity-list__copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {timestamp ? <time className="oh-activity-list__time">{timestamp}</time> : null}
      {to ? <ArrowUpRight className="oh-activity-list__arrow" size={16} aria-hidden="true" /> : null}
    </>
  )
}

export function ActivityList({ items, emptyMessage = 'No recent activity.' }: ActivityListProps) {
  if (items.length === 0) {
    return <p className="oh-activity-list__empty">{emptyMessage}</p>
  }

  return (
    <ul className="oh-activity-list">
      {items.map((item) => (
        <li key={item.id}>
          {item.to ? (
            <Link
              aria-label={[item.title, item.detail, item.timestamp]
                .filter(Boolean)
                .join(' ')
                .replace(/[·•]/g, ' ')}
              className="oh-activity-list__item"
              to={item.to}
            >
              <ActivityContent {...item} />
            </Link>
          ) : (
            <div className="oh-activity-list__item">
              <ActivityContent {...item} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
