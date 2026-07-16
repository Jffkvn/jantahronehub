import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, FolderOpen, Upload } from 'lucide-react'
import { useState } from 'react'
import { createPrivateObjectPath } from '../../../lib/security/privateFiles'
import { getSupabaseClient } from '../../../lib/supabase/client'
import { useAuth } from '../../auth/AuthProvider'
import { EmptyState } from '../../../components/ui/EmptyState'

const mimeExtensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const client = getSupabaseClient()
  const { access } = useAuth()
  const canUpload = Boolean(access?.permissionKeys.some((permission) => ['projects.assign_all', 'projects.update_all'].includes(permission)) || access?.roleKeys.includes('project_manager'))
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const query = useQuery({ queryKey: ['projects', projectId, 'documents'], queryFn: async () => {
    const result = await client.from('project_documents').select('*').eq('project_id', projectId).is('archived_at', null).order('created_at', { ascending: false })
    if (result.error) throw result.error
    return result.data || []
  } })
  const upload = useMutation({ mutationFn: async (file: File) => {
    const extension = mimeExtensions[file.type as keyof typeof mimeExtensions]
    if (!extension || file.size > 10 * 1024 * 1024) throw new Error('Use a PDF, JPG, PNG or WebP file up to 10 MB.')
    const { data: user } = await client.auth.getUser()
    if (!user.user) throw new Error('Sign in again to upload a document.')
    const documentId = crypto.randomUUID()
    const path = createPrivateObjectPath({ ownerId: user.user.id, category: 'projects', recordId: projectId, objectId: documentId, extension })
    const stored = await client.storage.from('private-files').upload(path, file, { upsert: false, contentType: file.type })
    if (stored.error) throw stored.error
    const registered = await client.rpc('rpc_register_project_document', { p_project_id: projectId, p_document_id: documentId, p_display_name: file.name, p_storage_path: path, p_mime_type: file.type, p_size_bytes: file.size })
    if (registered.error) { await client.storage.from('private-files').remove([path]); throw registered.error }
  }, onSuccess: async () => { setError(''); await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'documents'] }) }, onError: (caught: Error) => setError(caught.message) })
  return <div className="oh-form-stack">
    {canUpload ? <label className="oh-button oh-button--secondary" style={{ width: 'fit-content' }}><Upload size={16} /> Upload document<input hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file) }} /></label> : null}
    {error ? <div className="oh-alert oh-alert--danger" role="alert">{error}</div> : null}
    {query.isLoading ? <div role="status">Loading documents…</div> : null}
    {(query.data || []).map((document) => <article className="oh-card oh-project-document" key={document.id}><span className="oh-project-document__icon"><FileText size={18} /></span><div><strong>{document.display_name}</strong><small>{new Date(document.created_at).toLocaleString()}</small></div></article>)}
    {!query.isLoading && !query.data?.length ? <EmptyState icon={<FolderOpen size={22} />} title="No project documents yet" description="Contracts, site evidence, and completion records will appear here when uploaded." /> : null}
  </div>
}
