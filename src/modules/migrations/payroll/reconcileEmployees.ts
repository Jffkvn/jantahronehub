import type { HistoricalPayrollRow } from './parseHistoricalWorkbook.worker'

export interface ExistingHistoricalEmployee {
  id: string
  employeeNumber: string
  legalName: string
  companyEmail: string | null
}

export interface HistoricalEmployeeMatch {
  rowHash: string
  employeeNumber: string
  employeeName: string
  companyEmail: string | null
  employeeId: string
  matchedBy: 'employee_number' | 'email' | 'both'
  action: 'update'
}

export interface HistoricalEmployeeConflict {
  rowHash: string
  employeeNumber: string
  employeeName: string
  companyEmail: string | null
  reason: string
  suggestedEmployeeId?: string
}

export interface HistoricalEmployeeCandidate {
  employeeNumber: string
  employeeName: string
  companyEmail: string | null
  startDate: string | null
  endDate: string | null
  employmentType?: 'full_time' | 'part_time' | 'casual' | 'intern' | 'contractor'
  contractType?: 'permanent' | 'fixed_term' | 'casual' | 'internship' | 'consultancy'
  identityConflict?: string
}

export interface HistoricalEmployeeReview {
  reviewKey: string
  action: 'create' | 'enrich' | 'unchanged' | 'unresolved'
  employeeId: string | null
  employeeNumber: string
  employeeName: string
  companyEmail: string | null
  startDate: string | null
  endDate: string | null
  employmentType: 'full_time' | 'part_time' | 'casual' | 'intern' | 'contractor'
  contractType: 'permanent' | 'fixed_term' | 'casual' | 'internship' | 'consultancy'
  changes: Array<'companyEmail'>
  reason: string
  suggestedEmployeeId?: string
  suggestedEmployeeName?: string
}

function normalized(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function buildIndex(
  employees: ExistingHistoricalEmployee[],
  value: (employee: ExistingHistoricalEmployee) => string | null,
) {
  const index = new Map<string, ExistingHistoricalEmployee[]>()
  for (const employee of employees) {
    const key = normalized(value(employee))
    if (!key) continue
    index.set(key, [...(index.get(key) ?? []), employee])
  }
  return index
}

interface IdentityResolution {
  match?: ExistingHistoricalEmployee
  matchedBy?: HistoricalEmployeeMatch['matchedBy']
  reason?: string
  suggested?: ExistingHistoricalEmployee
}

function resolveIdentity(
  employeeNumber: string,
  companyEmail: string | null,
  employeeName: string,
  byNumber: Map<string, ExistingHistoricalEmployee[]>,
  byEmail: Map<string, ExistingHistoricalEmployee[]>,
  byName: Map<string, ExistingHistoricalEmployee[]>,
): IdentityResolution {
  const numberKey = normalized(employeeNumber)
  const emailKey = normalized(companyEmail)
  const numberMatches = numberKey ? byNumber.get(numberKey) ?? [] : []
  const emailMatches = emailKey ? byEmail.get(emailKey) ?? [] : []

  if (numberMatches.length > 1) return { reason: 'Employee number matches multiple existing employees.' }
  if (emailMatches.length > 1) return { reason: 'Company email matches multiple existing employees.' }

  const numberMatch = numberMatches[0]
  const emailMatch = emailMatches[0]
  if (numberMatch && emailMatch && numberMatch.id !== emailMatch.id) {
    return { reason: 'Identifiers match different existing employees.' }
  }
  if (numberMatch && emailKey && numberMatch.companyEmail && normalized(numberMatch.companyEmail) !== emailKey) {
    return { reason: 'Company email conflicts with the employee-number match.' }
  }
  if (emailMatch && numberKey && normalized(emailMatch.employeeNumber) !== numberKey) {
    return { reason: 'Employee number conflicts with the company-email match.' }
  }

  const match = numberMatch ?? emailMatch
  if (match) {
    return {
      match,
      matchedBy: numberMatch && emailMatch ? 'both' : numberMatch ? 'employee_number' : 'email',
    }
  }

  const nameMatches = byName.get(normalized(employeeName)) ?? []
  if (nameMatches.length === 1) {
    return {
      reason: 'Name-only match requires manual review.',
      suggested: nameMatches[0],
    }
  }
  if (nameMatches.length > 1) return { reason: 'Name matches multiple existing employees.' }
  return {}
}

function indexes(existing: ExistingHistoricalEmployee[]) {
  return {
    byNumber: buildIndex(existing, (employee) => employee.employeeNumber),
    byEmail: buildIndex(existing, (employee) => employee.companyEmail),
    byName: buildIndex(existing, (employee) => employee.legalName),
  }
}

export function historicalEmployeeReviewKey(candidate: Pick<HistoricalEmployeeCandidate, 'employeeNumber' | 'companyEmail' | 'employeeName'>) {
  const numberKey = normalized(candidate.employeeNumber)
  if (numberKey) return `number:${numberKey}`
  const emailKey = normalized(candidate.companyEmail)
  if (emailKey) return `email:${emailKey}`
  return `name:${normalized(candidate.employeeName)}`
}

export function reconcileHistoricalEmployees(
  rows: HistoricalPayrollRow[],
  existing: ExistingHistoricalEmployee[],
) {
  const { byNumber, byEmail, byName } = indexes(existing)
  const matches: HistoricalEmployeeMatch[] = []
  const conflicts: HistoricalEmployeeConflict[] = []

  for (const row of rows) {
    const resolution = resolveIdentity(
      row.employeeNumber,
      row.companyEmail,
      row.employeeName,
      byNumber,
      byEmail,
      byName,
    )
    if (resolution.reason) {
      conflicts.push({
        rowHash: row.rowHash,
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        companyEmail: row.companyEmail,
        reason: resolution.reason,
        suggestedEmployeeId: resolution.suggested?.id,
      })
      continue
    }
    if (!resolution.match || !resolution.matchedBy) continue
    matches.push({
      rowHash: row.rowHash,
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      companyEmail: row.companyEmail,
      employeeId: resolution.match.id,
      matchedBy: resolution.matchedBy,
      action: 'update',
    })
  }

  return { matches, conflicts }
}

export function buildHistoricalEmployeeReview(
  candidates: HistoricalEmployeeCandidate[],
  existing: ExistingHistoricalEmployee[],
  createId: () => string = () => crypto.randomUUID(),
): HistoricalEmployeeReview[] {
  const { byNumber, byEmail, byName } = indexes(existing)

  return candidates.map((candidate) => {
    const reviewKey = historicalEmployeeReviewKey(candidate)
    const resolution = resolveIdentity(
      candidate.employeeNumber,
      candidate.companyEmail,
      candidate.employeeName,
      byNumber,
      byEmail,
      byName,
    )
    const base = {
      reviewKey,
      employeeNumber: candidate.employeeNumber.trim(),
      employeeName: candidate.employeeName.trim(),
      companyEmail: candidate.companyEmail?.trim() || null,
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      employmentType: candidate.employmentType ?? 'full_time',
      contractType: candidate.contractType ?? 'permanent',
      changes: [] as Array<'companyEmail'>,
    }

    if (candidate.identityConflict) {
      return {
        ...base,
        action: 'unresolved' as const,
        employeeId: null,
        reason: candidate.identityConflict,
      }
    }

    if (resolution.reason) {
      return {
        ...base,
        action: 'unresolved' as const,
        employeeId: null,
        reason: resolution.reason,
        suggestedEmployeeId: resolution.suggested?.id,
        suggestedEmployeeName: resolution.suggested?.legalName,
      }
    }
    if (resolution.match) {
      const changes: Array<'companyEmail'> = []
      if (!resolution.match.companyEmail && candidate.companyEmail) changes.push('companyEmail')
      return {
        ...base,
        action: changes.length ? 'enrich' as const : 'unchanged' as const,
        employeeId: resolution.match.id,
        changes,
        reason: changes.length ? 'Fill blank profile fields from reviewed Staff Details.' : 'Reliable identifiers already match OneHub.',
      }
    }
    if (!candidate.employeeNumber.trim()) {
      return {
        ...base,
        action: 'unresolved' as const,
        employeeId: null,
        reason: 'A new employee profile requires an employee number.',
      }
    }
    if (!candidate.startDate) {
      return {
        ...base,
        action: 'unresolved' as const,
        employeeId: null,
        reason: 'A new employee profile requires a reviewed start date.',
      }
    }
    return {
      ...base,
      action: 'create' as const,
      employeeId: createId(),
      reason: 'Create a reviewed employee profile before importing payroll history.',
    }
  })
}
