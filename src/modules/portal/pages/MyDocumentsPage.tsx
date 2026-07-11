import { Download, FileText } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../components/ui/Button'
import { DataTable, type DataTableColumn } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/EmptyState'
import type { SelfServiceApi, SelfServiceDocument, SelfServiceProfile } from '../api/selfService'
import { formatBytes, formatDate, formatLabel } from './formatters'
import {
  MissingProfileState,
  PortalHeader,
} from './shared'

export function MyDocumentsPage({
  api,
  profile,
  documents,
}: {
  api: SelfServiceApi
  profile: SelfServiceProfile | null
  documents: SelfServiceDocument[]
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return <MissingProfileState />

  async function downloadDocument(document: SelfServiceDocument) {
    setError(null)
    setDownloadingId(document.id)
    try {
      const url = await api.createDocumentDownload(document)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('This document could not be opened. Please try again or contact HR.')
    } finally {
      setDownloadingId(null)
    }
  }

  const columns: Array<DataTableColumn<SelfServiceDocument>> = [
    {
      key: 'document',
      header: 'Document',
      render: (document) => (
        <div className="oh-person-cell">
          <strong>{document.displayName}</strong>
          <span>{formatLabel(document.documentType)}</span>
        </div>
      ),
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      render: (document) => formatDate(document.uploadedAt.slice(0, 10)),
    },
    {
      key: 'size',
      header: 'Size',
      render: (document) => formatBytes(document.sizeBytes),
    },
    {
      key: 'download',
      header: '',
      render: (document) => (
        <Button
          variant="secondary"
          onClick={() => void downloadDocument(document)}
          disabled={downloadingId === document.id}
          aria-label={`Download ${document.displayName}`}
        >
          <Download size={16} /> {downloadingId === document.id ? 'Opening' : 'Download'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PortalHeader
        eyebrow="Employee documents"
        title="My Documents"
        description="Access documents HR has marked visible to you."
      />
      {error ? <p className="oh-form-error">{error}</p> : null}
      {documents.length ? (
        <DataTable
          caption="My employee-visible documents"
          columns={columns}
          rows={documents}
          rowKey={(document) => document.id}
        />
      ) : (
        <EmptyState
          icon={<FileText />}
          title="No documents are visible yet"
          description="Documents will appear here after HR publishes them to your workspace."
        />
      )}
    </>
  )
}
