import { useEffect, useState } from 'react'
import { api, downloadAttachment, formatBytes, formatDate, uploadAttachment } from '../api'

export default function AttachmentsPanel({ entityType, entityId, onChanged }) {
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!entityId) return
    const data = await api(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`)
    setItems(data)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [entityType, entityId])

  async function onUpload(e) {
    e.preventDefault()
    if (!file) {
      setError('Choose a file first')
      return
    }
    setBusy(true)
    setError('')
    try {
      await uploadAttachment({
        entityType,
        entityId,
        file,
        title: title || undefined,
        notes: notes || undefined,
      })
      setTitle('')
      setNotes('')
      setFile(null)
      e.target.reset?.()
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id) {
    setBusy(true)
    try {
      await api(`/api/attachments/${id}`, { method: 'DELETE' })
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!entityId) {
    return <p className="muted">Save the record first, then you can attach documents.</p>
  }

  return (
    <div className="attachments">
      <h3>Documents</h3>
      <p className="muted">Store policy PDFs, statements, sale deeds, KYC scans, and related files here.</p>
      {error && <p className="error">{error}</p>}

      <form className="attach-form" onSubmit={onUpload}>
        <label>
          Title (optional)
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Policy PDF 2026" />
        </label>
        <label>
          File
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </label>
        <label className="full">
          Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where this came from / what it is" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload document'}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="empty">No documents yet.</p>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.id}>
              <div>
                <strong>{item.title || item.original_filename}</strong>
                <p className="muted">
                  {item.original_filename} · {formatBytes(item.size_bytes)} · {formatDate(item.created_at)}
                </p>
                {item.notes && <p className="muted">{item.notes}</p>}
              </div>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => downloadAttachment(item).catch((err) => setError(err.message))}>
                  Download
                </button>
                <button type="button" className="danger" onClick={() => onDelete(item.id)} disabled={busy}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
