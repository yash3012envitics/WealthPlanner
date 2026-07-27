import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatDate, formatMoney } from '../api'

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <div className="boot">Loading dashboard…</div>

  const nw = data.net_worth

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="muted">Welcome back, {data.user.full_name}</p>
          <h1>Your net worth</h1>
        </div>
        <Link className="button" to="/notifications">
          {data.unread_notifications} unread alerts
        </Link>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <section className="card hero-card">
          <p className="stat-label">Net worth as of {formatDate(nw.as_of)}</p>
          <div className={`hero-title ${nw.net_worth >= 0 ? 'positive' : 'negative'}`}>{formatMoney(nw.net_worth)}</div>
          <p className="muted">Assets {formatMoney(nw.total_assets)} − Liabilities {formatMoney(nw.total_liabilities)}</p>
        </section>
        <section className="card">
          <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Amount due</h3>
          <div className="list">
            <div className="list-item">
              <div>
                <p className="stat-label">This month · {data.dues_this_month?.label}</p>
                <div className="stat-value">{formatMoney(data.dues_this_month?.total_due || 0)}</div>
                <p className="muted">{data.dues_this_month?.installment_count || 0} unpaid installments</p>
              </div>
            </div>
            <div className="list-item">
              <div>
                <p className="stat-label">Next month · {data.dues_next_month?.label}</p>
                <div className="stat-value">{formatMoney(data.dues_next_month?.total_due || 0)}</div>
                <p className="muted">{data.dues_next_month?.installment_count || 0} unpaid installments</p>
              </div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Totals include pending/overdue premiums, SIPs, and EMIs by due date.
          </p>
        </section>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Upcoming payments</h3>
        {(data.upcoming_installments || []).length === 0 ? (
          <p className="empty">No SIP / premium / EMI dues through next month.</p>
        ) : (
          <div className="list">
            {data.upcoming_installments.map((row) => (
              <div className="list-item" key={row.id}>
                <div>
                  <strong>{row.plan_name}</strong>
                  <p className="muted">
                    {row.plan_kind.toUpperCase()}
                    {row.source === 'coin' ? ' · Coin' : ''} · {formatMoney(row.amount)}
                  </p>
                </div>
                <div>
                  <span className="badge">{row.status}</span>
                  <p className="muted">{formatDate(row.due_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Upcoming renewals</h3>
        {data.upcoming_renewals.length === 0 ? (
          <p className="empty">No renewals in the next 30 days.</p>
        ) : (
          <div className="list">
            {data.upcoming_renewals.map((p) => (
              <div className="list-item" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <p className="muted">
                    {p.provider} · {formatMoney(p.premium_amount)}
                  </p>
                </div>
                <div>
                  <span className="badge">{p.insurance_type}</span>
                  <p className="muted">{formatDate(p.renewal_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat-label">Investments</div>
          <div className="stat-value">{formatMoney(nw.investments)}</div>
          <p className="muted">{nw.investment_count} holdings</p>
        </div>
        <div className="card">
          <div className="stat-label">Property</div>
          <div className="stat-value">{formatMoney(nw.properties)}</div>
          <p className="muted">{nw.property_count} assets</p>
        </div>
        <div className="card">
          <div className="stat-label">Other assets</div>
          <div className="stat-value">{formatMoney(nw.other_assets || 0)}</div>
          <p className="muted">{nw.asset_count || 0} gold / FD / cash etc.</p>
        </div>
        <div className="card">
          <div className="stat-label">Liabilities</div>
          <div className="stat-value negative">{formatMoney(nw.total_liabilities)}</div>
          <p className="muted">{nw.liability_count} debts</p>
        </div>
      </div>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Alerts</h3>
          <Link className="button ghost" to="/notifications">
            View all
          </Link>
        </div>
        {data.recent_notifications.length === 0 ? (
          <p className="empty">No alerts right now.</p>
        ) : (
          <div className="list">
            {data.recent_notifications.map((n) => (
              <div className="list-item" key={n.id}>
                <div>
                  <strong>{n.title}</strong>
                  <p className="muted">{n.message}</p>
                  {n.due_date && <p className="muted">Due {formatDate(n.due_date)}</p>}
                </div>
                <span className="badge">{n.notification_type.replaceAll('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
