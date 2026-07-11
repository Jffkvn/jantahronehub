import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { employeeImportApi, type EmployeeImportApi } from '../api/employeeImports'
import { parseEmployeeWorkbookInWorker, validateEmployeeRows, type RawEmployeeRow, type ValidatedImportRow } from '../import/employeeParser'
import { downloadEmployeeErrorReport, downloadEmployeeTemplate } from '../import/employeeTemplate'

export function EmployeeImportPage({ api = employeeImportApi, parse = parseEmployeeWorkbookInWorker, downloadTemplate = downloadEmployeeTemplate }: { api?: EmployeeImportApi; parse?: (file: File) => Promise<RawEmployeeRow[]>; downloadTemplate?: () => void | Promise<void> }) {
  const [file, setFile] = useState<File>(); const [rows, setRows] = useState<ValidatedImportRow[]>([]); const [errors, setErrors] = useState<Array<{ rowNumber: number; field: string; message: string }>>([]); const [busy, setBusy] = useState(false); const [completed, setCompleted] = useState<Awaited<ReturnType<EmployeeImportApi['commit']>>>()
  async function handleFile(next: File) {
    setCompleted(undefined); setRows([]); setErrors([])
    if (!next.name.toLowerCase().endsWith('.xlsx') || next.size > 5 * 1024 * 1024) { setErrors([{ rowNumber: 0, field: 'file', message: 'Choose an .xlsx workbook no larger than 5 MB.' }]); return }
    setBusy(true); try { const [raw, existing, setup] = await Promise.all([parse(next), api.existingIdentities(), api.setup()]); const validation = validateEmployeeRows(raw, existing, setup); setFile(next); setRows(validation.rows); setErrors(validation.errors) } catch (error) { setErrors([{ rowNumber: 0, field: 'file', message: error instanceof Error ? error.message : 'Workbook could not be read.' }]) } finally { setBusy(false) }
  }
  async function confirm() { if (!file || errors.length) return; setBusy(true); try { setCompleted(await api.commit(file, rows)) } finally { setBusy(false) } }
  const creates = rows.filter((row) => row.action === 'create').length; const updates = rows.filter((row) => row.action === 'update').length
  return <section className="oh-workspace-page"><Link className="oh-back-link" to="/hr/employees"><ArrowLeft size={16} /> Employee directory</Link><header className="oh-page-header"><div><p>Bulk operations</p><h1>Employee import & export</h1><span>Validate and preview every change before it reaches live records.</span></div><div className="oh-dossier-actions"><Button variant="secondary" onClick={() => void downloadTemplate()}><Download size={17} /> Download template</Button><Button variant="secondary" onClick={() => void api.exportEmployees()}><Download size={17} /> Export employees</Button></div></header>
    <label className="oh-upload-zone"><Upload size={28} /><strong>Upload completed employee template</strong><span>.xlsx only, maximum 5 MB</span><input aria-label="Employee workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const next = event.target.files?.[0]; if (next) void handleFile(next) }} /></label>
    {busy ? <p role="status">Validating workbook…</p> : null}
    {errors.length ? <article className="oh-import-errors"><h2><AlertTriangle size={19} /> Correct these rows</h2>{errors.map((error, index) => <p key={`${error.rowNumber}-${error.field}-${index}`}><strong>{error.rowNumber ? `Row ${error.rowNumber}` : 'File'} · {error.field.replaceAll('_', ' ')}</strong><span>{error.message}</span></p>)}<div className="oh-form-actions"><Button variant="secondary" onClick={() => void downloadEmployeeErrorReport(errors)}><Download size={16} /> Download error report</Button></div></article> : null}
    {!errors.length && rows.length && !completed ? <article className="oh-import-preview"><FileSpreadsheet size={24} /><div><h2>Ready to import</h2><p>{creates} new employee{creates === 1 ? '' : 's'} · {updates} update{updates === 1 ? '' : 's'}</p><small>No records have changed yet.</small></div><Button loading={busy} onClick={() => void confirm()}>Confirm import</Button></article> : null}
    {completed ? <article className="oh-import-preview"><CheckCircle2 size={24} /><div><h2>Import completed</h2><p>{completed.created} created · {completed.updated} updated</p><small>Batch {completed.batchId}</small></div></article> : null}
  </section>
}
