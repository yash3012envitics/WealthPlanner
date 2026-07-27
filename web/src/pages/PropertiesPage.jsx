import { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'

const emptyForm = {
  name: '',
  property_type: 'residential',
  address: '',
  purchase_price: '',
  current_value: '',
  purchase_date: '',
  notes: '',
}

function toForm(item) {
  return {
    name: item.name || '',
    property_type: item.property_type || 'residential',
    address: item.address || '',
    purchase_price: item.purchase_price ?? '',
    current_value: item.current_value ?? '',
    purchase_date: item.purchase_date || '',
    notes: item.notes || '',
  }
}

export default function PropertiesPage() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    setItems(await api('/api/properties'))
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm(toForm(item))
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const body = {
      ...form,
      purchase_price: Number(form.purchase_price || 0),
      current_value: Number(form.current_value || 0),
    }
    try {
      if (editing) {
        await api(`/api/properties/${editing.id}`, { method: 'PUT', body })
        const refreshed = await api('/api/properties')
        setItems(refreshed)
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      } else {
        await api('/api/properties', { method: 'POST', body })
        setOpen(false)
        setForm(emptyForm)
        await load()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api(`/api/properties/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Property</h1>
          <p>Edit valuations and keep sale deeds, tax receipts, and agreements attached.</p>
        </div>
        <button type="button" onClick={openCreate}>
          Add property
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>Type</th>
              <th>Purchase</th>
              <th>Current value</th>
              <th>Docs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="muted">{item.address}</div>
                </td>
                <td>
                  <span className="badge">{item.property_type}</span>
                </td>
                <td>
                  {formatMoney(item.purchase_price)}
                  <div className="muted">{formatDate(item.purchase_date)}</div>
                </td>
                <td>{formatMoney(item.current_value)}</td>
                <td>{item.attachment_count || 0}</td>
                <td>
                  <div className="actions">
                    <button type="button" className="ghost" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(item.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="empty">No properties yet.</p>}
      </section>

      {open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h2>{editing ? 'Edit property' : 'Add property'}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Type
                <select value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })}>
                  {['residential', 'commercial', 'land', 'other'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">
                Address
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
              </label>
              <label>
                Purchase price
                <input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
              </label>
              <label>
                Current value
                <input type="number" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} />
              </label>
              <label>
                Purchase date
                <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required />
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">{editing ? 'Save changes' : 'Save property'}</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setOpen(false)
                    setEditing(null)
                  }}
                >
                  Close
                </button>
              </div>
            </form>
            {editing && <AttachmentsPanel entityType="property" entityId={editing.id} onChanged={load} />}
          </div>
        </div>
      )}
    </div>
  )
}
