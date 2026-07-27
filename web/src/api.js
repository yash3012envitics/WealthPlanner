const rawBase = import.meta.env.VITE_API_URL || ''
const API_BASE = rawBase.replace(/\/+$/, '')

function getToken() {
  return localStorage.getItem('wp_token')
}

function parseError(data) {
  const detail = data.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  return data.message || 'Request failed'
}

export async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof URLSearchParams || options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  // Let the browser set multipart boundary for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body:
      options.body &&
      !(options.body instanceof URLSearchParams) &&
      !(options.body instanceof FormData) &&
      typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
  })

  if (res.status === 204) return null

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseError(data))
  return data
}

export async function uploadAttachment({ entityType, entityId, file, title, notes }) {
  const body = new FormData()
  body.append('entity_type', entityType)
  body.append('entity_id', String(entityId))
  if (title) body.append('title', title)
  if (notes) body.append('notes', notes)
  body.append('file', file)
  return api('/api/attachments', { method: 'POST', body })
}

export async function downloadAttachment(attachment) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${attachment.download_url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = attachment.original_filename || attachment.title || 'document'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function formatMoney(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
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

export function formatBytes(bytes) {
  const n = Number(bytes || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
