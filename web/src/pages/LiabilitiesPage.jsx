import { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'
import RecurringPlansPanel from '../components/RecurringPlansPanel'

const emptyForm = {
  name: '',
  liability_type: 'loan',
  outstanding_amount: '',
  interest_rate: '',
  due_date: '',
  notes: '',
}

function toForm(item) {
  return {
    name: item.name || '',
    liability_type: item.liability_type || 'loan',
    outstanding_amount: item.outstanding_amount ?? '',
    interest_rate: item.interest_rate ?? '',
    due_date: item.due_date || '',
    notes: item.notes || '',
  }
}

export default function LiabilitiesPage() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    setItems(await api('/api/liabilities'))
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
      outstanding_amount: Number(form.outstanding_amount || 0),
      interest_rate: Number(form.interest_rate || 0),
      due_date: form.due_date || null,
    }
    try {
      if (editing) {
        await api(`/api/liabilities/${editing.id}`, { method: 'PUT', body })
        const refreshed = await api('/api/liabilities')
        setItems(refreshed)
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      } else {
        await api('/api/liabilities', { method: 'POST', body })
        setOpen(false)
        setForm(emptyForm)
        await load()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api(`/api/liabilities/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Liabilities</h1>
          <p>Edit loan balances and attach sanction letters or statements.</p>
        </div>
        <button type="button" onClick={openCreate}>
          Add liability
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Outstanding</th>
              <th>Rate</th>
              <th>Due</th>
              <th>Docs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="muted">{item.notes || '—'}</div>
                </td>
                <td>
                  <span className="badge">{item.liability_type.replace('_', ' ')}</span>
                </td>
                <td className="negative">{formatMoney(item.outstanding_amount)}</td>
                <td>{item.interest_rate}%</td>
                <td>{formatDate(item.due_date)}</td>
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
        {items.length === 0 && <p className="empty">No liabilities yet.</p>}
      </section>

      {open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h2>{editing ? 'Edit liability' : 'Add liability'}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Type
                <select value={form.liability_type} onChange={(e) => setForm({ ...form, liability_type: e.target.value })}>
                  {['home_loan', 'personal_loan', 'credit_card', 'loan', 'other'].map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Outstanding amount
                <input type="number" value={form.outstanding_amount} onChange={(e) => setForm({ ...form, outstanding_amount: e.target.value })} required />
              </label>
              <label>
                Interest rate %
                <input type="number" step="any" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
              </label>
              <label>
                Due date
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">{editing ? 'Save changes' : 'Save liability'}</button>
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
            {editing && (
              <>
                <AttachmentsPanel entityType="liability" entityId={editing.id} onChanged={load} />
                <RecurringPlansPanel
                  entityType="liability"
                  entityId={editing.id}
                  defaultKind="emi"
                  defaultName={`${editing.name} EMI`}
                  defaultAmount=""
                  defaultFrequency="monthly"
                  defaultStart={editing.due_date || ''}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
