import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, formatDate, formatMoney } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'
import RecurringPlansPanel from '../components/RecurringPlansPanel'

const emptyForm = {
  name: '',
  symbol: '',
  investment_type: 'stock',
  quantity: '',
  buy_price: '',
  current_price: '',
  purchase_date: '',
  notes: '',
}

function toForm(item) {
  return {
    name: item.name || '',
    symbol: item.symbol || '',
    investment_type: item.investment_type || 'stock',
    quantity: item.quantity ?? '',
    buy_price: item.buy_price ?? '',
    current_price: item.current_price ?? '',
    purchase_date: item.purchase_date || '',
    notes: item.notes || '',
  }
}

function summarize(list) {
  const invested = list.reduce((s, i) => s + Number(i.invested_value || 0), 0)
  const current = list.reduce((s, i) => s + Number(i.current_value || 0), 0)
  const gain = current - invested
  const pct = invested ? (gain / invested) * 100 : 0
  return {
    count: list.length,
    invested,
    current,
    gain,
    pct,
  }
}

function formatPct(value) {
  const n = Number(value || 0)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function PlText({ gain, pct }) {
  const cls = gain >= 0 ? 'positive' : 'negative'
  return (
    <span className={cls}>
      {formatMoney(gain)} ({formatPct(pct)})
    </span>
  )
}

export default function InvestmentsPage() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [kiteStatus, setKiteStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [requestToken, setRequestToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  async function load() {
    const [holdings, status] = await Promise.all([api('/api/investments'), api('/api/kite/status')])
    setItems(holdings)
    setKiteStatus(status)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    const kiteToken = searchParams.get('request_token')
    const status = searchParams.get('status')
    if (kiteToken && status === 'success') {
      setRequestToken(kiteToken)
      setMessage('Kite returned a request token. Click “Complete session” to finish login, then Sync.')
      searchParams.delete('request_token')
      searchParams.delete('status')
      searchParams.delete('action')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

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
      buy_price: Number(form.buy_price || 0),
      current_price: Number(form.current_price || 0),
      symbol: form.symbol || null,
    }
    try {
      if (editing) {
        await api(`/api/investments/${editing.id}`, { method: 'PUT', body })
        const refreshed = await api('/api/investments')
        setItems(refreshed)
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      } else {
        await api('/api/investments', { method: 'POST', body })
        setOpen(false)
        setForm(emptyForm)
        await load()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api(`/api/investments/${id}`, { method: 'DELETE' })
    await load()
  }

  async function saveCredentials() {
    setBusy(true)
    setError('')
    try {
      const status = await api('/api/kite/credentials', {
        method: 'POST',
        body: { api_key: apiKey, api_secret: apiSecret },
      })
      setKiteStatus(status)
      setMessage('Credentials saved. Open Kite login next.')
      setApiSecret('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function openKiteLogin() {
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/kite/login-url')
      window.open(data.login_url, '_blank', 'noopener,noreferrer')
      setMessage(data.redirect_hint)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function completeSession() {
    setBusy(true)
    setError('')
    try {
      const status = await api('/api/kite/session', {
        method: 'POST',
        body: { request_token: requestToken },
      })
      setKiteStatus(status)
      setRequestToken('')
      setMessage('Kite session active. Click Sync now to import holdings.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/kite/sync', { method: 'POST' })
      setMessage(result.message)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const stocks = useMemo(
    () => items.filter((i) => i.investment_type === 'stock' || i.investment_type === 'etf'),
    [items],
  )
  const mutualFunds = useMemo(() => items.filter((i) => i.investment_type === 'mutual_fund'), [items])
  const others = useMemo(
    () => items.filter((i) => !['stock', 'etf', 'mutual_fund'].includes(i.investment_type)),
    [items],
  )
  const stockSummary = useMemo(() => summarize(stocks), [stocks])
  const mfSummary = useMemo(() => summarize(mutualFunds), [mutualFunds])
  const allSummary = useMemo(() => summarize(items), [items])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Investments</h1>
          <p>Edit holdings, attach statements, and sync from Zerodha Kite & Coin.</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={syncNow} disabled={busy || !kiteStatus?.connected}>
            Sync Kite / Coin
          </button>
          <button type="button" onClick={openCreate}>
            Add holding
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <section className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Zerodha Kite + Coin sync</h3>
        <p className="muted">
          Equity from Kite; mutual funds and active SIPs from Coin. Sync creates monthly SIP schedules and
          dashboard dues/alerts for this and next month. Full MF transaction history is not available via
          Kite Connect — recent orders (≈7 days) mark payments paid. Access tokens expire daily (~6 AM IST).
        </p>
        <p className="muted" style={{ marginBottom: 12 }}>
          Status:{' '}
          {kiteStatus?.connected
            ? `Connected as ${kiteStatus.kite_user_name || kiteStatus.kite_user_id}`
            : kiteStatus?.has_credentials
              ? 'Credentials saved — login required'
              : 'Not connected'}
          {kiteStatus?.last_synced_at ? ` · Last sync ${formatDate(kiteStatus.last_synced_at)}` : ''}
        </p>
        <div className="form-grid">
          <label>
            API key
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From developers.kite.trade" />
          </label>
          <label>
            API secret
            <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </label>
          <label className="full">
            Request token
            <input value={requestToken} onChange={(e) => setRequestToken(e.target.value)} />
          </label>
          <div className="actions full">
            <button type="button" onClick={saveCredentials} disabled={busy || !apiKey || !apiSecret}>
              Save credentials
            </button>
            <button type="button" className="ghost" onClick={openKiteLogin} disabled={busy || !kiteStatus?.has_credentials}>
              Open Kite login
            </button>
            <button type="button" className="ghost" onClick={completeSession} disabled={busy || !requestToken}>
              Complete session
            </button>
            <button type="button" onClick={syncNow} disabled={busy || !kiteStatus?.connected}>
              Sync now
            </button>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Stocks / ETF', summary: stockSummary },
          { label: 'Mutual funds', summary: mfSummary },
          { label: 'All holdings', summary: allSummary },
        ].map(({ label, summary }) => (
          <section className="card" key={label}>
            <p className="stat-label">{label}</p>
            <div className="stat-value">{formatMoney(summary.current)}</div>
            <p className="muted">
              Invested {formatMoney(summary.invested)} · {summary.count} holdings
            </p>
            <p style={{ marginTop: 6 }}>
              <PlText gain={summary.gain} pct={summary.pct} />
            </p>
          </section>
        ))}
      </div>

      {[
        { title: 'Stocks / ETF', rows: stocks },
        { title: 'Mutual funds', rows: mutualFunds },
        { title: 'Other', rows: others },
      ]
        .filter((section) => section.rows.length > 0 || section.title !== 'Other')
        .map((section) => {
          const totals = summarize(section.rows)
          if (section.rows.length === 0) return null
          return (
            <section className="card table-wrap" key={section.title} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{section.title}</h3>
                <div style={{ textAlign: 'right' }}>
                  <strong>{formatMoney(totals.current)}</strong>
                  <div>
                    <PlText gain={totals.gain} pct={totals.pct} />
                  </div>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Source</th>
                    <th>Qty</th>
                    <th>Invested</th>
                    <th>Current</th>
                    <th>P/L</th>
                    <th>Docs</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="muted">
                          {item.symbol || '—'} · {item.investment_type.replace('_', ' ')} · since {formatDate(item.purchase_date)}
                        </div>
                      </td>
                      <td>
                        <span className="badge">{item.source || 'manual'}</span>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.invested_value)}</td>
                      <td>{formatMoney(item.current_value)}</td>
                      <td>
                        <PlText gain={item.gain_loss} pct={item.gain_loss_pct} />
                      </td>
                      <td>{item.attachment_count || 0}</td>
                      <td>
                        <div className="actions">
                          <button type="button" className="ghost" onClick={() => openEdit(item)}>
                            Edit
                          </button>
                          {(item.source || 'manual') === 'manual' && (
                            <button type="button" className="danger" onClick={() => remove(item.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })}

      {items.length === 0 && (
        <section className="card">
          <p className="empty">No investments yet.</p>
        </section>
      )}

      {open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h2>{editing ? 'Edit investment' : 'Add investment'}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Symbol
                <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
              </label>
              <label>
                Type
                <select value={form.investment_type} onChange={(e) => setForm({ ...form, investment_type: e.target.value })}>
                  {['stock', 'mutual_fund', 'etf', 'bond', 'other'].map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity / units
                <input type="number" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              </label>
              <label>
                Buy price
                <input type="number" step="any" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} required />
              </label>
              <label>
                Current price
                <input type="number" step="any" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value })} required />
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
                <button type="submit">{editing ? 'Save changes' : 'Save holding'}</button>
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
                <AttachmentsPanel entityType="investment" entityId={editing.id} onChanged={load} />
                <RecurringPlansPanel
                  entityType="investment"
                  entityId={editing.id}
                  defaultKind="sip"
                  defaultName={`${editing.name} SIP`}
                  defaultAmount=""
                  defaultFrequency="monthly"
                  defaultStart={editing.purchase_date || ''}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
