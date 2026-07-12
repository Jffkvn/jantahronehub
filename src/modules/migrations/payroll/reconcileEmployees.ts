import type { HistoricalPayrollRow } from './parseHistoricalWorkbook.worker'

export interface ExistingHistoricalEmployee {
  id: string
  employeeNumber: string
  legalName: string
  companyEmail: string | null
}

export interface HistoricalEmployeeMatch {
  employeeNumber: string
  employeeName: string
  employeeId: string
  action: 'update'
}

export interface HistoricalEmployeeConflict {
  employeeNumber: string
  employeeName: string
  reason: string
}

function normalized(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

export function reconcileHistoricalEmployees(
  rows: HistoricalPayrollRow[],
  existing: ExistingHistoricalEmployee[],
) {
  const byNumber = new Map(existing.map((employee) => [normalized(employee.employeeNumber), employee]))
  const byEmail = new Map(
    existing
      .filter((employee) => employee.companyEmail)
      .map((employee) => [normalized(employee.companyEmail), employee]),
  )
  const byName = new Map(existing.map((employee) => [normalized(employee.legalName), employee]))
  const matches: HistoricalEmployeeMatch[] = []
  const conflicts: HistoricalEmployeeConflict[] = []

  for (const row of rows) {
    const numberMatch = byNumber.get(normalized(row.employeeNumber))
    const emailMatch = row.companyEmail ? byEmail.get(normalized(row.companyEmail)) : undefined
    const ids = new Set([numberMatch?.id, emailMatch?.id].filter(Boolean))
    if (ids.size > 1) {
      conflicts.push({
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        reason: 'Identifiers match different existing employees.',
      })
      continue
    }
    const identifierMatch = numberMatch ?? emailMatch
    if (identifierMatch) {
      matches.push({
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        employeeId: identifierMatch.id,
        action: 'update',
      })
      continue
    }
    if (byName.has(normalized(row.employeeName))) {
      conflicts.push({
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        reason: 'Name-only match requires manual review.',
      })
    }
  }

  return { matches, conflicts }
}
