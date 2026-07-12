import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { projectsApi, type MissedUpdateRecord } from '../api/projects'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { EmptyState } from '../../../components/ui/EmptyState'
import { AlertCircle, Calendar, RefreshCw } from 'lucide-react'

export function MissedUpdatesTab() {
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const hasReadAll = permissions.includes('daily_updates.read_all')

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // Fetch missed updates
  const { data: missedUpdates = [], isLoading, refetch, error } = useQuery<MissedUpdateRecord[]>({
    queryKey: ['missed-updates', date],
    queryFn: () => projectsApi.checkMissedDailyUpdates(date),
    enabled: hasReadAll && !!date,
    retry: false
  })

  if (!hasReadAll) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <EmptyState
          title="Access Restricted"
          description="Global missed updates reporting is restricted to administrative and executive roles (Managing Director, CFO, HR, and Admin)."
          icon={<AlertCircle size={22} />}
        />
      </div>
    )
  }

  return (
    <div className="oh-form-stack" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Missed Field Updates Log</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>Identify active projects with unsubmitted daily field coordination logs.</p>
        </div>
        <div>
          <Button variant="secondary" onClick={() => void refetch()} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>
      </div>

      {/* Date Picker */}
      <div style={{ maxWidth: '300px' }}>
        <Input
          label="Reporting Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* Results */}
      {isLoading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Auditing active assignments...
        </div>
      ) : error ? (
        <div style={{ padding: 'var(--space-4)', background: 'var(--color-danger-surface)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}>
          Failed to fetch missed updates report. {(error as any).message}
        </div>
      ) : missedUpdates.length === 0 ? (
        <EmptyState
          title="All updates submitted"
          description={`Every active project coordinator successfully submitted their field update log for ${new Date(date).toLocaleDateString()}.`}
          icon={<Calendar size={22} />}
        />
      ) : (
        <div className="oh-table-wrapper">
          <table className="oh-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Project Name</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3)' }}>Assigned Coordinator</th>
                <th style={{ textAlign: 'center', padding: 'var(--space-3)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {missedUpdates.map((record, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-3)', fontWeight: 600 }}>{record.project_name}</td>
                  <td style={{ padding: 'var(--space-3)' }}>{record.user_full_name}</td>
                  <td style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)', background: 'var(--color-danger-surface)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
                      MISSED LOG
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
