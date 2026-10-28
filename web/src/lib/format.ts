const dayFormat = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export const parseDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

export function formatDay(iso: string | null | undefined) {
  return iso ? dayFormat.format(parseDate(iso)) : '—'
}

export function formatMonth(iso: string | null | undefined) {
  return iso ? monthFormat.format(parseDate(iso.length === 7 ? `${iso}-01` : iso)) : '—'
}

export function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatSigned(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const text = formatNumber(Math.abs(value), digits)
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text
}

export function plural(count: number, noun: string) {
  return `${count.toLocaleString('en-PH')} ${noun}${count === 1 ? '' : 's'}`
}

export function median(values: number[]) {
  if (!values.length) return null
  const sorted = values.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function trendsUrl(query: string) {
  return `https://trends.google.com/trends/explore?geo=PH&date=all&q=${encodeURIComponent(query)}`
}
