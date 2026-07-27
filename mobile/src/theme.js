export const colors = {
  bg: '#0f1c18',
  panel: '#1c3a31',
  ink: '#f7f1e8',
  muted: '#b7c7bf',
  accent: '#d6a45a',
  accentDeep: '#b8823a',
  positive: '#5ecf9a',
  negative: '#ef7d6a',
  line: 'rgba(247,241,232,0.12)',
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
