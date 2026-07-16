import { Archive, Pencil, RotateCcw } from 'lucide-react'

import { Button } from '../../../components/ui/Button'
import { DataTable } from '../../../components/ui/DataTable'
import { StatusBadge } from '../../../components/ui/StatusBadge'

export interface SetupDisplayRecord {
  id: string
  code: string
  name: string
  detail: string
  dependencies: string
  archived: boolean
}

export function SetupRecordList({
  caption,
  emptyMessage,
  records,
  onEdit,
  onToggleArchived,
}: {
  caption: string
  emptyMessage: string
  records: SetupDisplayRecord[]
  onEdit: (id: string) => void
  onToggleArchived: (id: string) => void
}) {
  return (
    <DataTable
      caption={caption}
      emptyMessage={emptyMessage}
      rows={records}
      rowKey={(record) => record.id}
      columns={[
        {
          key: 'record',
          header: 'Record',
          render: (record) => (
            <div className="oh-person-cell">
              <strong>{record.name}</strong>
              <span>{record.code}</span>
            </div>
          ),
        },
        { key: 'detail', header: 'Details', render: (record) => record.detail },
        { key: 'dependencies', header: 'In use', render: (record) => record.dependencies },
        {
          key: 'status',
          header: 'Status',
          render: (record) => (
            <StatusBadge tone={record.archived ? 'neutral' : 'success'}>
              {record.archived ? 'Archived' : 'Active'}
            </StatusBadge>
          ),
        },
        {
          key: 'actions',
          header: '',
          render: (record) => (
            <div className="oh-row-actions">
              <Button
                variant="ghost"
                onClick={() => onEdit(record.id)}
                aria-label={`Edit ${record.name}`}
              >
                <Pencil size={15} aria-hidden="true" /> Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() => onToggleArchived(record.id)}
                aria-label={`${record.archived ? 'Restore' : 'Archive'} ${record.name}`}
              >
                {record.archived ? <RotateCcw size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
                {record.archived ? 'Restore' : 'Archive'}
              </Button>
            </div>
          ),
        },
      ]}
    />
  )
}
