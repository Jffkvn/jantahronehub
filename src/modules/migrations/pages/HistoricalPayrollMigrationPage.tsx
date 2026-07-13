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
  const [profileReviewConfirmed, setProfileReviewConfirmed] = useState(false)
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const preview = stage ? buildHistoricalPayrollPreview(stage.parsed) : null
  const needsMapping = preview?.needsMapping ?? []
  const unresolvedReviews = stage?.employeeReviews.filter(
    (review) => review.action === 'unresolved' && !resolutions[review.reviewKey],
  ) ?? []
  const unresolvedRows = stage?.unmatchedRows.filter(
    (row) => !row.reviewKey || !resolutions[row.reviewKey],
  ) ?? []
  const canCommit = Boolean(
    stage
    && profileReviewConfirmed
    && !stage.parsed.errors.length
    && !needsMapping.length
    && !unresolvedReviews.length
    && !unresolvedRows.length,
  )

  async function validate(next: File, overrideMappings = mappings) {
    setCompleted(undefined)
    setError(undefined)
    setProfileReviewConfirmed(false)
    setResolutions({})
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
      setCompleted(await api.commit(file, stage, { confirmed: profileReviewConfirmed, resolutions }))
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

      {unresolvedRows.length ? (
        <article className="oh-import-errors">
          <h2>
            <AlertTriangle size={19} /> Employee matches need review
          </h2>
          {unresolvedRows.slice(0, 20).map((item, index) => (
            <p key={`${item.periodStart}-${item.rowNumber}-${index}`}>
              <strong>{item.periodStart} row {item.rowNumber || '-'}</strong>
              <span>{item.employeeNumber || item.employeeName}: {item.reason}</span>
            </p>
          ))}
        </article>
      ) : null}

      {stage?.employeeReviews.length ? (
        <article className="oh-import-preview">
          <div className="oh-form-stack" style={{ width: '100%' }}>
            <div>
              <h2>Employee profile review</h2>
              <p>
                {stage.employeeReviews.filter((review) => review.action === 'create').length} create ·{' '}
                {stage.employeeReviews.filter((review) => review.action === 'enrich').length} enrich ·{' '}
                {stage.employeeReviews.filter((review) => review.action === 'unchanged').length} unchanged ·{' '}
                {unresolvedReviews.length} unresolved
              </p>
              <small>Nothing changes until every unresolved identity is cleared and you confirm this review.</small>
            </div>

            <div className="oh-table-wrapper">
              <table className="oh-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Proposed action</th>
                    <th>Review details</th>
                  </tr>
                </thead>
                <tbody>
                  {stage.employeeReviews.map((review) => (
                    <tr key={review.reviewKey}>
                      <td>
                        <strong>{review.employeeName}</strong>
                        <small style={{ display: 'block' }}>{review.employeeNumber || review.companyEmail || 'No reliable identifier'}</small>
                      </td>
                      <td><strong>{review.action}</strong></td>
                      <td>
                        <span>{review.reason}</span>
                        {review.action === 'create' ? (
                          <small style={{ display: 'block' }}>
                            {review.startDate} · {review.employmentType.replaceAll('_', ' ')} · {review.contractType.replaceAll('_', ' ')}
                          </small>
                        ) : null}
                        {review.suggestedEmployeeId ? (
                          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                            <input
                              type="checkbox"
                              checked={resolutions[review.reviewKey] === review.suggestedEmployeeId}
                              onChange={(event) => setResolutions((current) => {
                                const next = { ...current }
                                if (event.target.checked) next[review.reviewKey] = review.suggestedEmployeeId as string
                                else delete next[review.reviewKey]
                                return next
                              })}
                            />
                            Use suggested employee {review.suggestedEmployeeName}
                          </label>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={profileReviewConfirmed}
                onChange={(event) => setProfileReviewConfirmed(event.target.checked)}
              />
              Confirm reviewed employee profile changes and identity matches
            </label>
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
