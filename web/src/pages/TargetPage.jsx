import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatDate, formatMoney } from '../api'

const emptyForm = {
  name: 'Net worth target',
  target_amount: '',
  target_date: '',
  is_active: true,
  expected_annual_return: '12',
  notes: '',
}

export default function TargetPage() {
  const [goals, setGoals] = useState([])
  const [netWorth, setNetWorth] = useState(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    const [g, nw] = await Promise.all([api('/api/goals'), api('/api/networth')])
    setGoals(g)
    setNetWorth(nw)
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
    setForm({
      name: item.name || 'Net worth target',
      target_amount: item.target_amount ?? '',
      target_date: item.target_date || '',
      is_active: item.is_active !== false,
      expected_annual_return: String(((item.expected_annual_return ?? 0.12) * 100).toFixed(1)).replace(/\.0$/, ''),
      notes: item.notes || '',
    })
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const body = {
      ...form,
      target_amount: Number(form.target_amount || 0),
      expected_annual_return: Number(form.expected_annual_return || 12) / 100,
      notes: form.notes || null,
    }
    try {
      if (editing) {
        await api(`/api/goals/${editing.id}`, { method: 'PUT', body })
      } else {
        await api('/api/goals', { method: 'POST', body })
        setOpen(false)
      }
      await load()
      if (editing) {
        const refreshed = await api('/api/goals')
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api(`/api/goals/${id}`, { method: 'DELETE' })
    await load()
  }

  async function activate(item) {
    await api(`/api/goals/${item.id}`, { method: 'PUT', body: { is_active: true } })
    await load()
  }

  const active = goals.find((g) => g.is_active)
  const gap = active && netWorth ? Number(active.target_amount) - Number(netWorth.net_worth) : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Net worth target</h1>
          <p>Set the net worth you want to reach by a date. The Plan page turns this into monthly spend and invest guidance.</p>
        </div>
        <div className="actions">
          <Link className="ghost" to="/plan" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.6rem 1rem' }}>
            Open plan
          </Link>
          <button type="button" onClick={openCreate}>
            Set target
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <section className="card">
          <p className="stat-label">Current net worth</p>
          <div className="stat-value">{formatMoney(netWorth?.net_worth || 0)}</div>
        </section>
        <section className="card">
          <p className="stat-label">Active target</p>
          <div className="stat-value">{active ? formatMoney(active.target_amount) : '—'}</div>
          <p className="muted">{active ? `by ${formatDate(active.target_date)}` : 'No active target'}</p>
        </section>
        <section className="card">
          <p className="stat-label">Gap</p>
          <div className="stat-value">{gap == null ? '—' : formatMoney(gap)}</div>
        </section>
      </div>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Return</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {goals.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="muted">{item.notes || '—'}</div>
                </td>
                <td>{formatMoney(item.target_amount)}</td>
                <td>{formatDate(item.target_date)}</td>
                <td>{((item.expected_annual_return ?? 0.12) * 100).toFixed(1)}%</td>
                <td>{item.is_active ? <span className="badge">Active</span> : 'Inactive'}</td>
                <td>
                  <div className="actions">
                    {!item.is_active && (
                      <button type="button" className="ghost" onClick={() => activate(item)}>
                        Activate
                      </button>
                    )}
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
        {goals.length === 0 && <p className="empty">No targets yet. Set an amount and date to unlock the plan.</p>}
      </section>

      {open && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{editing ? 'Edit target' : 'Set net worth target'}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Target amount (₹)
                <input type="number" step="any" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} required />
              </label>
              <label>
                Target date
                <input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} required />
              </label>
              <label>
                Assumed market return (% / yr)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={form.expected_annual_return}
                  onChange={(e) => setForm({ ...form, expected_annual_return: e.target.value })}
                  required
                />
              </label>
              <label>
                Active
                <select value={form.is_active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'yes' })}>
                  <option value="yes">Yes (use in plan)</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">{editing ? 'Save changes' : 'Save target'}</button>
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
          </div>
        </div>
      )}
    </div>
  )
}
