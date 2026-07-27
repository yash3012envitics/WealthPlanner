import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'

// Change this to your machine LAN IP when testing on a physical device.
export const API_BASE = 'http://127.0.0.1:8000'

function parseError(data) {
  const detail = data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  return data?.message || 'Request failed'
}

export async function api(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers = {
    ...(options.body instanceof URLSearchParams
      ? { 'Content-Type': 'application/x-www-form-urlencoded' }
      : isForm
        ? {}
        : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }
  const token = await AsyncStorage.getItem('wp_token')
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body:
      options.body &&
      !(options.body instanceof URLSearchParams) &&
      !isForm &&
      typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
  })

  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseError(data))
  return data
}

export async function uploadAttachment({ entityType, entityId, uri, name, mimeType, title, notes }) {
  const token = await AsyncStorage.getItem('wp_token')
  const form = new FormData()
  form.append('entity_type', entityType)
  form.append('entity_id', String(entityId))
  if (title) form.append('title', title)
  if (notes) form.append('notes', notes)
  form.append('file', {
    uri,
    name: name || 'document.pdf',
    type: mimeType || 'application/octet-stream',
  })

  const res = await fetch(`${API_BASE}/api/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseError(data))
  return data
}

export async function openAttachment(attachment) {
  const token = await AsyncStorage.getItem('wp_token')
  const target = `${FileSystem.cacheDirectory}${attachment.original_filename || attachment.filename}`
  const result = await FileSystem.downloadAsync(`${API_BASE}${attachment.download_url}`, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri)
  }
  return result.uri
}
