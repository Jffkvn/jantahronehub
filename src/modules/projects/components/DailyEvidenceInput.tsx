import { useEffect, useState } from 'react'
import { Image, Paperclip, Trash2 } from 'lucide-react'

import { Button } from '../../../components/ui/Button'
import { projectsApi } from '../api/projects'
import { toSafeExternalUrl } from '../../../lib/security/safeUrl'

export const MAX_DAILY_EVIDENCE_FILES = 10

export function DailyEvidenceInput({ files, existingPaths = [], onFilesChange, onRemoveExisting, onError }: {
  files: File[]
  existingPaths?: string[]
  onFilesChange: (files: File[]) => void
  onRemoveExisting?: (path: string) => void
  onError: (message: string) => void
}) {
  const addFiles = (selected: FileList | null) => {
    if (!selected) return
    const next = [...files, ...Array.from(selected)]
    if (next.length + existingPaths.length > MAX_DAILY_EVIDENCE_FILES) {
      onError('You can attach up to 10 photos to one daily update.')
      return
    }
    onFilesChange(next)
  }

  return <div className="oh-field oh-evidence-picker">
    <label className="oh-field__label" htmlFor="daily-evidence-files"><Paperclip size={14} /> Progress evidence photos</label>
    <input id="daily-evidence-files" className="oh-input" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif,.avif" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = '' }} />
    <small>Up to 10 JPG, PNG, WebP, HEIC, HEIF or AVIF photos · 10 MB maximum per photo.</small>
    {[...existingPaths.map((path) => ({ key: path, label: path.split('/').at(-1) || 'Existing photo', existing: true })),
      ...files.map((file, index) => ({ key: `${file.name}-${file.lastModified}-${index}`, label: file.name, existing: false, index }))].length ? (
      <ul className="oh-evidence-picker__list">
        {existingPaths.map((path) => <li key={path}><Image size={15} /><span>Existing photo</span>{onRemoveExisting ? <Button type="button" variant="ghost" onClick={() => onRemoveExisting(path)} aria-label="Remove existing photo"><Trash2 size={15} /></Button> : null}</li>)}
        {files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><Image size={15} /><span>{file.name}</span><Button type="button" variant="ghost" onClick={() => onFilesChange(files.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}><Trash2 size={15} /></Button></li>)}
      </ul>
    ) : null}
  </div>
}

export function DailyEvidenceGallery({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<Array<{ path: string; url: string }>>([])
  useEffect(() => {
    let active = true
    void Promise.all(paths.map(async (path) => {
      const legacyUrl = toSafeExternalUrl(path)
      return { path, url: legacyUrl || await projectsApi.createDailyEvidenceDownload(path) }
    })).then((resolved) => { if (active) setUrls(resolved) }).catch(() => { if (active) setUrls([]) })
    return () => { active = false }
  }, [paths])
  if (!urls.length) return null
  return <div className="oh-evidence-gallery">{urls.map(({ path, url }, index) => {
    const needsDownloadCard = /[.](?:heic|heif)$/i.test(path)
    return <a key={path} href={url} target="_blank" rel="noreferrer">
      {needsDownloadCard
        ? <span className="oh-evidence-gallery__file"><Image size={18} /> Open phone photo {index + 1}</span>
        : <img src={url} alt={`Daily update evidence ${index + 1}`} />}
    </a>
  })}</div>
}
