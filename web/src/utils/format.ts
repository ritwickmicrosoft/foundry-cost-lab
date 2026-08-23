export const formatMoney = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits,
  }).format(value)

export const formatNumber = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat('en-CA', {
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits,
  }).format(value)

export const formatPercent = (value: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`))