const kampalaDateFormatter = new Intl.DateTimeFormat('en-UG', {
  timeZone: 'Africa/Kampala',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function formatKampalaDate(date: Date = new Date()) {
  return kampalaDateFormatter.format(date)
}
