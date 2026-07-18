import { useQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { trainingApi,type TrainingApi } from '../../hr/api/training'
import { TrainingDocumentsModal } from '../../hr/components/TrainingDocumentsModal'
import { PortalHeader } from './shared'
export function MyTrainingPage({api=trainingApi}:{api?:TrainingApi}){const records=useQuery({queryKey:['my-training-records'],queryFn:api.listMine});const [documentsFor,setDocumentsFor]=useState<{id:string;topic:string}|null>(null);return <section><PortalHeader eyebrow="Learning and compliance" title="My Training" description="Your training history, results, certificates and renewal dates."/>{records.data?.length?<div className="oh-card-grid">{records.data.map(r=><article className="oh-card" key={r.id}><BookOpen/><p>{r.completionDate}</p><h2>{r.topic}</h2><p>{r.provider??'Provider not recorded'} · {r.status}</p>{r.expiryDate?<p>Expires: {r.expiryDate}</p>:null}{r.certificateReference?<strong>{r.certificateReference}</strong>:null}<small>{r.certificateCount} certificate file(s)</small>{r.certificateCount?<Button type="button" variant="secondary" className="oh-button--small" onClick={()=>setDocumentsFor(r)}>View certificates</Button>:null}</article>)}</div>:!records.isLoading?<EmptyState icon={<BookOpen/>} title="No training records yet" description="Completed training and certifications will appear here."/>:<p role="status">Loading training records…</p>}<TrainingDocumentsModal api={api} recordId={documentsFor?.id??null} title={documentsFor?.topic??''} onClose={()=>setDocumentsFor(null)}/></section>}
