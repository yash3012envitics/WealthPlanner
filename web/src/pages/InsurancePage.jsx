import { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'
import RecurringPlansPanel from '../components/RecurringPlansPanel'

const emptyForm = {
  name: '',
  provider: '',
  policy_number: '',
  insurance_type: 'health',
  sum_assured: '',
  premium_amount: '',
  premium_frequency: 'yearly',
  start_date: '',
  renewal_date: '',
  notes: '',
}

function toForm(item) {
  return {
    name: item.name || '',
    provider: item.provider || '',
    policy_number: item.policy_number || '',
    insurance_type: item.insurance_type || 'health',
    sum_assured: item.sum_assured ?? '',
    premium_amount: item.premium_amount ?? '',
    premium_frequency: item.premium_frequency || 'yearly',
    start_date: item.start_date || '',
    renewal_date: item.renewal_date || '',
    notes: item.notes || '',
  }
}

export default function InsurancePage() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    setItems(await api('/api/insurance'))
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
      sum_assured: Number(form.sum_assured || 0),
      premium_amount: Number(form.premium_amount || 0),
    }
    try {
      if (editing) {
        await api(`/api/insurance/${editing.id}`, { method: 'PUT', body })
      } else {
        await api('/api/insurance', { method: 'POST', body })
        setOpen(false)
        setEditing(null)
        setForm(emptyForm)
      }
      if (editing) {
        const refreshed = await api('/api/insurance')
        setItems(refreshed)
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      } else {
        await load()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api(`/api/insurance/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Insurance</h1>
          <p>Health, term, life, auto, home — edit policies and keep PDFs attached.</p>
        </div>
        <button type="button" onClick={openCreate}>
          Add policy
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Policy</th>
              <th>Type</th>
              <th>Sum assured</th>
              <th>Premium</th>
              <th>Renewal</th>
              <th>Docs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="muted">
                    {item.provider} · {item.policy_number}
                  </div>
                </td>
                <td>
                  <span className="badge">{item.insurance_type}</span>
                </td>
                <td>{formatMoney(item.sum_assured)}</td>
                <td>
                  {formatMoney(item.premium_amount)}
                  <div className="muted">{item.premium_frequency}</div>
                </td>
                <td>{formatDate(item.renewal_date)}</td>
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
        {items.length === 0 && <p className="empty">No policies yet.</p>}
      </section>

      {open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h2>{editing ? 'Edit insurance policy' : 'Add insurance policy'}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Provider
                <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} required />
              </label>
              <label>
                Policy number
                <input value={form.policy_number} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} required />
              </label>
              <label>
                Type
                <select value={form.insurance_type} onChange={(e) => setForm({ ...form, insurance_type: e.target.value })}>
                  {['health', 'term', 'life', 'auto', 'home', 'other'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sum assured
                <input type="number" value={form.sum_assured} onChange={(e) => setForm({ ...form, sum_assured: e.target.value })} />
              </label>
              <label>
                Premium
                <input type="number" value={form.premium_amount} onChange={(e) => setForm({ ...form, premium_amount: e.target.value })} />
              </label>
              <label>
                Start date
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
              </label>
              <label>
                Renewal date
                <input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} required />
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">{editing ? 'Save changes' : 'Save policy'}</button>
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
                <AttachmentsPanel entityType="insurance" entityId={editing.id} onChanged={load} />
                <RecurringPlansPanel
                  entityType="insurance"
                  entityId={editing.id}
                  defaultKind="premium"
                  defaultName={`${editing.name} premium`}
                  defaultAmount={String(editing.premium_amount || '')}
                  defaultFrequency={editing.premium_frequency === 'monthly' ? 'monthly' : 'yearly'}
                  defaultStart={editing.start_date || ''}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
