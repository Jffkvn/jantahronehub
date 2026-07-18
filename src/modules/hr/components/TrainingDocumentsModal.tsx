import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FormError } from '../../../components/ui/FormError'
import { Modal } from '../../../components/ui/Modal'
import { trainingApi, type TrainingApi } from '../api/training'

export function TrainingDocumentsModal({ api = trainingApi, recordId, title, canManage = false, onClose }: {
  api?: TrainingApi
  recordId: string | null
  title: string
  canManage?: boolean
  onClose(): void
}) {
  const queryClient = useQueryClient()
  const documents = useQuery({
    queryKey: ['training-documents', recordId],
    queryFn: () => api.listDocuments(recordId!),
    enabled: Boolean(recordId),
  })
  const remove = useMutation({
    mutationFn: api.removeDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['training-documents', recordId] }),
  })
  const download = async (path: string) => {
    const url = await api.createDocumentDownload(path)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return <Modal open={Boolean(recordId)} title={`Certificates · ${title}`} onClose={onClose}>
    {documents.isError ? <FormError>Certificate files could not be loaded.</FormError> : null}
    {remove.isError ? <FormError>{remove.error.message}</FormError> : null}
    {documents.data?.length ? <div className="oh-list-stack">{documents.data.map(document => <article className="oh-card" key={document.id}>
      <div className="oh-section-header"><div><FileText size={18}/><strong>{document.originalFileName}</strong><small>{Math.ceil(document.sizeBytes / 1024)} KB</small></div><div className="oh-form-actions">
        <Button type="button" variant="secondary" className="oh-button--small" onClick={() => void download(document.storagePath)}><Download size={15}/>Open</Button>
        {canManage ? <Button type="button" variant="ghost" className="oh-button--small" onClick={() => remove.mutate(document.id)}><Trash2 size={15}/>Remove</Button> : null}
      </div></div>
    </article>)}</div> : !documents.isLoading ? <EmptyState icon={<FileText/>} title="No certificate files" description="A certificate reference may still be recorded on the training entry."/> : <p role="status">Loading certificate files…</p>}
  </Modal>
}
