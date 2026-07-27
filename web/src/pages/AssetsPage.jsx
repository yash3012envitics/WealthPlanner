import { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'

const ASSET_TYPES = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'fixed_deposit', label: 'Fixed deposit' },
  { value: 'cash', label: 'Cash / bank balance' },
  { value: 'home_payment', label: 'Amount paid toward home' },
  { value: 'ppf', label: 'PPF' },
  { value: 'epf', label: 'EPF' },
  { value: 'nps', label: 'NPS' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
]

const emptyForm = {
  name: '',
  asset_type: 'gold',
  quantity: '',
  unit: 'grams',
  purity_karat: '24',
  purchase_value: '',
  current_value: '',
  purchase_date: '',
  maturity_date: '',
  interest_rate: '',
  institution: '',
  notes: '',
}

function toForm(item) {
  return {
    name: item.name || '',
    asset_type: item.asset_type || 'other',
    quantity: item.quantity ?? '',
    unit: item.unit || '',
    purity_karat: item.purity_karat ?? 24,
    purchase_value: item.purchase_value ?? '',
    current_value: item.current_value ?? '',
    purchase_date: item.purchase_date || '',
    maturity_date: item.maturity_date || '',
    interest_rate: item.interest_rate ?? '',
    institution: item.institution || '',
    notes: item.notes || '',
  }
}

function typeLabel(value) {
  return ASSET_TYPES.find((t) => t.value === value)?.label || value
}

function isMetal(type) {
  return type === 'gold' || type === 'silver'
}

export default function AssetsPage() {
  const [items, setItems] = useState([])
  const [prices, setPrices] = useState(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    const [assets, metalPrices] = await Promise.all([
      api('/api/assets'),
      api('/api/assets/metals/prices').catch(() => null),
    ])
    setItems(assets)
    setPrices(metalPrices)
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
      quantity: Number(form.quantity || 0),
      purity_karat: Number(form.purity_karat || 24),
      purchase_value: Number(form.purchase_value || 0),
      current_value: Number(form.current_value || 0),
      interest_rate: Number(form.interest_rate || 0),
      unit: form.unit || null,
      institution: form.institution || null,
      maturity_date: form.maturity_date || null,
      notes: form.notes || null,
    }
    try {
      if (editing) {
        await api(`/api/assets/${editing.id}`, { method: 'PUT', body })
        const refreshed = await api('/api/assets')
        setItems(refreshed)
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      } else {
        await api('/api/assets', { method: 'POST', body })
        setOpen(false)
        setForm(emptyForm)
        await load()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api(`/api/assets/${id}`, { method: 'DELETE' })
    await load()
  }

  async function refreshMetals() {
    setRefreshing(true)
    setError('')
    try {
      const result = await api('/api/assets/metals/refresh', { method: 'POST' })
      setPrices(result.prices)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const total = items.reduce((sum, item) => sum + Number(item.current_value || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Other assets</h1>
          <p>Gold, silver, fixed deposits, cash, home payments, PPF, and more — included in net worth.</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={refreshMetals} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh gold / silver'}
          </button>
          <button type="button" onClick={openCreate}>
            Add asset
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {prices && (
        <section className="card" style={{ marginBottom: 16 }}>
          <p className="stat-label">Live India metals (INR spot)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 8 }}>
            <div>
              <div className="muted">Gold 24K / g</div>
              <strong>{formatMoney(prices.gold_per_gram_24k)}</strong>
            </div>
            <div>
              <div className="muted">Gold 22K / g</div>
              <strong>{formatMoney(prices.gold_per_gram_22k)}</strong>
            </div>
            <div>
              <div className="muted">Silver / g</div>
              <strong>{formatMoney(prices.silver_per_gram)}</strong>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Source: {prices.source} · {prices.as_of}
            {prices.source.includes('spot') || prices.source.includes('gold-api') || prices.source.includes('USD')
              ? ' · international spot in INR (not jeweller retail)'
              : ''}
          </p>
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <p className="stat-label">Total other assets</p>
        <div className="stat-value">{formatMoney(total)}</div>
        <p className="muted">{items.length} records</p>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Qty</th>
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
                  <div className="muted">
                    {item.institution || '—'}
                    {item.asset_type === 'gold' && item.purity_karat ? ` · ${item.purity_karat}K` : ''}
                    {item.maturity_date ? ` · matures ${formatDate(item.maturity_date)}` : ''}
                  </div>
                </td>
                <td>
                  <span className="badge">{typeLabel(item.asset_type)}</span>
                </td>
                <td>
                  {item.quantity || '—'}
                  {item.unit ? ` ${item.unit}` : ''}
                </td>
                <td>{formatMoney(item.purchase_value)}</td>
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
        {items.length === 0 && <p className="empty">No other assets yet. Add gold, FDs, cash, or home payments.</p>}
      </section>

      {open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h2>{editing ? 'Edit asset' : 'Add asset'}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. 22K gold coins" />
              </label>
              <label>
                Type
                <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
                  {ASSET_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 50" />
              </label>
              <label>
                Unit
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="grams / kg / tola" />
              </label>
              {isMetal(form.asset_type) && form.asset_type === 'gold' && (
                <label>
                  Purity (karat)
                  <select value={form.purity_karat} onChange={(e) => setForm({ ...form, purity_karat: e.target.value })}>
                    <option value="24">24K</option>
                    <option value="22">22K</option>
                    <option value="18">18K</option>
                    <option value="14">14K</option>
                  </select>
                </label>
              )}
              <label>
                Purchase / cost value
                <input type="number" step="any" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
              </label>
              <label>
                Current value
                <input type="number" step="any" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} required />
                {isMetal(form.asset_type) && (
                  <span className="muted">Use “Refresh gold / silver” to set from live INR spot × quantity.</span>
                )}
              </label>
              <label>
                Purchase / start date
                <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required />
              </label>
              <label>
                Maturity date (FD etc.)
                <input type="date" value={form.maturity_date} onChange={(e) => setForm({ ...form, maturity_date: e.target.value })} />
              </label>
              <label>
                Interest rate %
                <input type="number" step="any" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
              </label>
              <label>
                Institution / bank
                <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="e.g. SBI, jeweller" />
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">{editing ? 'Save changes' : 'Save asset'}</button>
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
            {editing && <AttachmentsPanel entityType="asset" entityId={editing.id} onChanged={load} />}
          </div>
        </div>
      )}
    </div>
  )
}
