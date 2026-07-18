import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { LeaveRequest, LeaveType } from '../api/leave'

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function LeaveCalendar({ requests, leaveTypes = [] }: { requests: LeaveRequest[]; leaveTypes?: LeaveType[] }) {
  const [month, setMonth] = useState(() => { const value = new Date(); return new Date(value.getFullYear(), value.getMonth(), 1) })
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const approved = requests.filter((request) => request.status === 'approved')
  const colorFor = (request: LeaveRequest) => leaveTypes.find((type) => type.id === request.leaveTypeId)?.color ?? '#16866f'
  const recordsFor = (day: number) => {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return approved.filter((request) => request.startDate <= date && request.endDate >= date)
  }

  return <section className="oh-card oh-leave-calendar" aria-label="Leave calendar">
    <div className="oh-leave-calendar__header"><ButtonIcon label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={20} /></ButtonIcon><h2>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2><ButtonIcon label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={20} /></ButtonIcon></div>
    {leaveTypes.length ? <div className="oh-leave-legend">{leaveTypes.map((type) => <span key={type.id}><i style={{ background: type.color }} />{type.name}{type.isPaid ? '' : ' (unpaid)'}</span>)}</div> : null}
    <div className="oh-leave-month-grid">{days.map((day) => <strong className="oh-leave-month-grid__weekday" key={day}>{day}</strong>)}{Array.from({ length: firstDay }, (_, index) => <span className="oh-leave-day oh-leave-day--empty" key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <article className="oh-leave-day" key={day}><b>{day}</b>{recordsFor(day).map((request) => <span key={request.id} style={{ borderLeftColor: colorFor(request) }}>{request.employeeName ?? request.leaveTypeName}<small>{request.leaveTypeName}</small></span>)}</article>)}</div>
  </section>
}

function ButtonIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button className="oh-leave-calendar__button" type="button" aria-label={label} onClick={onClick}>{children}</button>
}
