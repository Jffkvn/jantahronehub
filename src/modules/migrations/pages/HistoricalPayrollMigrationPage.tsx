import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import {
  buildHistoricalPayrollPreview,
  type HistoricalPayrollMapping,
} from '../payroll/parseHistoricalWorkbook.worker'
import {
  historicalPayrollImportApi,
  type HistoricalPayrollImportApi,
  type HistoricalPayrollStage,
} from '../payroll/historicalPayrollImportApi'

const money = (value: number) =>
  new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(value)

export function HistoricalPayrollMigrationPage({
  api = historicalPayrollImportApi,
}: {
  api?: HistoricalPayrollImportApi
}) {
  const [file, setFile] = useState<File>()
  const [stage, setStage] = useState<HistoricalPayrollStage>()
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [completed, setCompleted] = useState<Awaited<ReturnType<HistoricalPayrollImportApi['commit']>>>()
  const preview = stage ? buildHistoricalPayrollPreview(stage.parsed) : null
  const needsMapping = preview?.needsMapping ?? []
  const canCommit = Boolean(stage && !stage.parsed.errors.length && !needsMapping.length && !stage.unmatchedRows.length)

  async function validate(next: File, overrideMappings = mappings) {
    setCompleted(undefined)
    setError(undefined)
    setBusy(true)
    try {
      const explicitMappings: HistoricalPayrollMapping[] = Object.entries(overrideMappings)
        .filter(([, periodStart]) => periodStart)
        .map(([sheetName, periodStart]) => ({ sheetName, periodStart: `${periodStart}-01` }))
      setFile(next)
      setStage(await api.stage(next, explicitMappings))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Historical payroll workbook could not be read.')
      setStage(undefined)
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!file || !stage || !canCommit) return
    setBusy(true)
    setError(undefined)
    try {
      setCompleted(await api.commit(file, stage))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Historical payroll migration could not be committed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="oh-workspace-page">
      <Link className="oh-back-link" to="/hr/payroll">
        <ArrowLeft size={16} /> Payroll runs
      </Link>
      <header className="oh-page-header">
        <div>
          <p>Protected migration</p>
          <h1>Historical payroll migration</h1>
          <span>Stage legacy payroll history, review conflicts, then commit immutable approved runs.</span>
        </div>
      </header>

      <label className="oh-upload-zone">
        <Upload size={28} />
        <strong>Upload historical payroll workbook</strong>
        <span>.xlsx only. Staff advances are not imported in this step.</span>
        <input
          aria-label="Historical payroll workbook"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const next = event.target.files?.[0]
            if (next) void validate(next)
          }}
        />
      </label>

      {busy ? <p role="status">Reading workbook...</p> : null}
      {error ? <p className="oh-form-error">{error}</p> : null}

      {preview ? (
        <div className="oh-dashboard-grid">
          <article className="oh-dashboard-card">
            <FileSpreadsheet size={22} />
            <h2>{preview.periodCount} payroll periods</h2>
            <p>{preview.rowCount} historical employee rows found.</p>
          </article>
          <article className="oh-dashboard-card">
            <h2>Latest payroll</h2>
            <p>{preview.latestPeriod?.label ?? 'Not detected'}</p>
          </article>
          <article className="oh-dashboard-card">
            <h2>Ready rows</h2>
            <p>{stage?.rowsReadyForCommit ?? 0} matched to OneHub employees.</p>
          </article>
        </div>
      ) : null}

      {needsMapping.length ? (
        <article className="oh-import-errors">
          <h2>
            <AlertTriangle size={19} /> Map these legacy sheets
          </h2>
          {needsMapping.map((sheet) => (
            <label key={sheet.sheetName}>
              {sheet.sheetName}
              <input
                type="month"
                value={mappings[sheet.sheetName] ?? ''}
                onChange={(event) => setMappings((current) => ({ ...current, [sheet.sheetName]: event.target.value }))}
              />
            </label>
          ))}
          {file ? (
            <Button variant="secondary" onClick={() => void validate(file)}>
              Re-validate mappings
            </Button>
          ) : null}
        </article>
      ) : null}

      {stage?.parsed.errors.length ? (
        <article className="oh-import-errors">
          <h2>
            <AlertTriangle size={19} /> Workbook issues
          </h2>
          {stage.parsed.errors.slice(0, 12).map((item, index) => (
            <p key={`${item.sheetName}-${index}`}>
              <strong>{item.sheetName}</strong>
              <span>{item.message}</span>
            </p>
          ))}
        </article>
      ) : null}

      {stage?.unmatchedRows.length ? (
        <article className="oh-import-errors">
          <h2>
            <AlertTriangle size={19} /> Employee matches need review
          </h2>
          {stage.unmatchedRows.slice(0, 20).map((item, index) => (
            <p key={`${item.periodStart}-${item.rowNumber}-${index}`}>
              <strong>{item.periodStart} row {item.rowNumber || '-'}</strong>
              <span>{item.employeeNumber || item.employeeName}: {item.reason}</span>
            </p>
          ))}
        </article>
      ) : null}

      {preview?.currentEmployees.length ? (
        <article className="oh-import-preview">
          <div>
            <h2>Current profile recommendations</h2>
            <p>
              {preview.currentEmployees.filter((employee) => employee.currentStatus === 'active').length} active,
              {' '}
              {preview.currentEmployees.filter((employee) => employee.currentStatus === 'inactive').length} inactive,
              {' '}
              {preview.currentEmployees.filter((employee) => employee.currentStatus === 'needs_review').length} needing review.
            </p>
            <small>Use these recommendations to prepare the employee template before committing payroll history.</small>
          </div>
        </article>
      ) : null}

      {stage && !completed ? (
        <article className="oh-import-preview">
          <div>
            <h2>Historical payroll commit</h2>
            <p>
              {stage.parsed.periods.reduce((total, period) => total + period.rowCount, 0)} rows ·{' '}
              {money(stage.parsed.periods.reduce((total, period) => total + period.totals.net, 0))} net pay
            </p>
            <small>No payroll history changes until this is confirmed.</small>
          </div>
          <Button loading={busy} disabled={!canCommit} onClick={() => void confirm()}>
            Commit history
          </Button>
        </article>
      ) : null}

      {completed ? (
        <article className="oh-import-preview">
          <CheckCircle2 size={24} />
          <div>
            <h2>Historical payroll committed</h2>
            <p>{completed.periods} periods · {completed.rows} rows</p>
            <small>Batch {completed.batchId}</small>
          </div>
        </article>
      ) : null}
    </section>
  )
}
