import { useEffect, useMemo, useState } from 'react'
import { api, formatMoney } from '../api'

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

const emptyIncome = {
  name: '',
  amount: '',
  frequency: 'monthly',
  category: 'salary',
  is_active: true,
  notes: '',
}

const emptyExpense = {
  name: '',
  amount: '',
  frequency: 'monthly',
  category: 'living',
  is_active: true,
  notes: '',
}

function freqLabel(value) {
  return FREQUENCIES.find((f) => f.value === value)?.label || value
}

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseMonthValue(value) {
  const [y, m] = value.split('-').map(Number)
  return { year: y, month: m }
}

export default function CashflowPage() {
  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [monthValue, setMonthValue] = useState(currentMonthValue)
  const [monthData, setMonthData] = useState(null)
  const [tab, setTab] = useState('defaults')
  const [kind, setKind] = useState('income')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyIncome)
  const [oneOff, setOneOff] = useState({ name: '', amount: '', notes: '' })
  const [overrideDrafts, setOverrideDrafts] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { year, month } = useMemo(() => parseMonthValue(monthValue), [monthValue])

  async function loadDefaults() {
    const [i, e] = await Promise.all([api('/api/income'), api('/api/expenses')])
    setIncomes(i)
    setExpenses(e)
  }

  async function loadMonth() {
    const data = await api(`/api/cashflow/month?year=${year}&month=${month}`)
    setMonthData(data)
    const next = {}
    data.income_lines.forEach((line) => {
      if (line.entry_id != null) next[`income-${line.entry_id}`] = String(line.amount)
    })
    data.expense_lines.forEach((line) => {
      if (line.entry_id != null) next[`expense-${line.entry_id}`] = String(line.amount)
    })
    setOverrideDrafts(next)
  }

  async function loadAll() {
    await loadDefaults()
    await loadMonth()
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadMonth().catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  function openCreate(nextKind) {
    setKind(nextKind)
    setEditing(null)
    setForm(nextKind === 'income' ? emptyIncome : emptyExpense)
    setOpen(true)
  }

  function openEdit(nextKind, item) {
    setKind(nextKind)
    setEditing(item)
    setForm({
      name: item.name || '',
      amount: item.amount ?? '',
      frequency: item.frequency || 'monthly',
      category: item.category || '',
      is_active: item.is_active !== false,
      notes: item.notes || '',
    })
    setOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const body = {
      ...form,
      amount: Number(form.amount || 0),
      notes: form.notes || null,
      category: form.category || (kind === 'income' ? 'salary' : 'living'),
    }
    const base = kind === 'income' ? '/api/income' : '/api/expenses'
    try {
      if (editing) await api(`${base}/${editing.id}`, { method: 'PUT', body })
      else {
        await api(base, { method: 'POST', body })
        setOpen(false)
      }
      await loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeDefault(nextKind, id) {
    const base = nextKind === 'income' ? '/api/income' : '/api/expenses'
    await api(`${base}/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  async function saveOverride(nextKind, entryId) {
    setSaving(true)
    setError('')
    try {
      const key = `${nextKind}-${entryId}`
      const amount = Number(overrideDrafts[key] || 0)
      const path = nextKind === 'income' ? `/api/cashflow/income/${year}/${month}` : `/api/cashflow/expenses/${year}/${month}`
      await api(path, { method: 'PUT', body: { entry_id: entryId, amount } })
      await loadMonth()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function clearOverride(nextKind, overrideId) {
    if (!overrideId) return
    const path =
      nextKind === 'income' ? `/api/cashflow/income-overrides/${overrideId}` : `/api/cashflow/expense-overrides/${overrideId}`
    await api(path, { method: 'DELETE' })
    await loadMonth()
  }

  async function addOneOff(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const path = kind === 'income' ? `/api/cashflow/income/${year}/${month}` : `/api/cashflow/expenses/${year}/${month}`
      await api(path, {
        method: 'PUT',
        body: {
          entry_id: null,
          name: oneOff.name,
          amount: Number(oneOff.amount || 0),
          notes: oneOff.notes || null,
        },
      })
      setOneOff({ name: '', amount: '', notes: '' })
      await loadMonth()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const incomeMonthly = incomes.filter((i) => i.is_active).reduce((s, i) => s + Number(i.monthly_amount || 0), 0)
  const expenseMonthly = expenses.filter((i) => i.is_active).reduce((s, i) => s + Number(i.monthly_amount || 0), 0)

  const defaultRows = kind === 'income' ? incomes : expenses
  const monthLines = kind === 'income' ? monthData?.income_lines || [] : monthData?.expense_lines || []
  const linkedLines = monthLines.filter((l) => l.entry_id != null)
  const oneOffLines = monthLines.filter((l) => l.source === 'one_off')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cashflow</h1>
          <p>
            Set fixed monthly defaults, then optionally override amounts for a specific month. The plan uses month
            values when present, otherwise your defaults.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={() => openCreate('income')}>
            Add default income
          </button>
          <button type="button" onClick={() => openCreate('expense')}>
            Add default expense
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <section className="card">
          <p className="stat-label">Default income / mo</p>
          <div className="stat-value">{formatMoney(incomeMonthly)}</div>
        </section>
        <section className="card">
          <p className="stat-label">Default expenses / mo</p>
          <div className="stat-value">{formatMoney(expenseMonthly)}</div>
        </section>
        <section className="card">
          <p className="stat-label">{monthData?.label || 'Selected month'} income</p>
          <div className="stat-value">{formatMoney(monthData?.income_total || 0)}</div>
        </section>
        <section className="card">
          <p className="stat-label">{monthData?.label || 'Selected month'} expenses</p>
          <div className="stat-value">{formatMoney(monthData?.expense_total || 0)}</div>
        </section>
      </div>

      <div className="actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" className={tab === 'defaults' ? '' : 'ghost'} onClick={() => setTab('defaults')}>
          Fixed defaults
        </button>
        <button type="button" className={tab === 'month' ? '' : 'ghost'} onClick={() => setTab('month')}>
          Month amounts
        </button>
        <button type="button" className={kind === 'income' ? '' : 'ghost'} onClick={() => setKind('income')}>
          Income
        </button>
        <button type="button" className={kind === 'expense' ? '' : 'ghost'} onClick={() => setKind('expense')}>
          Expenses
        </button>
        {tab === 'month' && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
            Month
            <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
          </label>
        )}
      </div>

      {tab === 'defaults' && (
        <section className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Monthly default</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {defaultRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="muted">{item.notes || '—'}</div>
                  </td>
                  <td>
                    <span className="badge">{item.category}</span>
                  </td>
                  <td>
                    {formatMoney(item.amount)}
                    <div className="muted">{freqLabel(item.frequency)}</div>
                  </td>
                  <td>{formatMoney(item.monthly_amount)}</td>
                  <td>{item.is_active ? 'Active' : 'Paused'}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="ghost" onClick={() => openEdit(kind, item)}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => removeDefault(kind, item.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {defaultRows.length === 0 && <p className="empty">No {kind} defaults yet.</p>}
        </section>
      )}

      {tab === 'month' && (
        <>
          <section className="card table-wrap" style={{ marginBottom: 16 }}>
            <p className="muted" style={{ marginBottom: 12 }}>
              Leave a line on its default, or save a month-specific amount. Clear override to return to the fixed
              default for that month.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Default</th>
                  <th>This month</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linkedLines.map((line) => {
                  const key = `${kind}-${line.entry_id}`
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{line.name}</strong>
                        <div className="muted">{line.category}</div>
                      </td>
                      <td>{formatMoney(line.default_amount)}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={overrideDrafts[key] ?? line.amount}
                          onChange={(e) => setOverrideDrafts({ ...overrideDrafts, [key]: e.target.value })}
                          style={{ width: 140 }}
                        />
                      </td>
                      <td>
                        <span className="badge">{line.source === 'override' ? 'Month override' : 'Default'}</span>
                      </td>
                      <td>
                        <div className="actions">
                          <button type="button" className="ghost" disabled={saving} onClick={() => saveOverride(kind, line.entry_id)}>
                            Save
                          </button>
                          {line.override_id && (
                            <button type="button" className="danger" onClick={() => clearOverride(kind, line.override_id)}>
                              Clear
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {linkedLines.length === 0 && (
              <p className="empty">Add fixed {kind} defaults first, then override them per month here.</p>
            )}
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 12 }}>One-off {kind} for {monthData?.label || 'month'}</h2>
            <form className="form-grid" onSubmit={addOneOff}>
              <label>
                Name
                <input value={oneOff.name} onChange={(e) => setOneOff({ ...oneOff, name: e.target.value })} required placeholder="Bonus / trip / gift" />
              </label>
              <label>
                Amount
                <input type="number" step="any" value={oneOff.amount} onChange={(e) => setOneOff({ ...oneOff, amount: e.target.value })} required />
              </label>
              <label className="full">
                Notes
                <input value={oneOff.notes} onChange={(e) => setOneOff({ ...oneOff, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit" disabled={saving}>
                  Add one-off
                </button>
              </div>
            </form>
            {oneOffLines.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {oneOffLines.map((line) => (
                  <div key={line.override_id} className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <strong>{line.name}</strong> · {formatMoney(line.amount)}
                    </div>
                    <button type="button" className="danger" onClick={() => clearOverride(kind, line.override_id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {open && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>
              {editing ? 'Edit' : 'Add'} default {kind}
            </h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Amount
                <input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </label>
              <label>
                Frequency
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </label>
              <label>
                Active
                <select value={form.is_active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'yes' })}>
                  <option value="yes">Yes</option>
                  <option value="no">Paused</option>
                </select>
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">{editing ? 'Save changes' : 'Save'}</button>
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
