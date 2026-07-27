import { useEffect, useState } from 'react'
import { api, formatDate } from '../api'

export default function NotificationsPage() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setItems(await api('/api/notifications'))
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function markRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' })
    await load()
  }

  async function markAll() {
    await api('/api/notifications/read-all', { method: 'POST' })
    await load()
  }

  async function refresh() {
    await api('/api/notifications/refresh', { method: 'POST' })
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>Renewals and payment dues within the next 30 days.</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={refresh}>
            Scan renewals
          </button>
          <button type="button" onClick={markAll}>
            Mark all read
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card">
        {items.length === 0 ? (
          <p className="empty">No alerts right now.</p>
        ) : (
          <div className="list">
            {items.map((item) => (
              <div className="list-item" key={item.id}>
                <div>
                  <strong style={{ opacity: item.is_read ? 0.7 : 1 }}>{item.title}</strong>
                  <p className="muted">{item.message}</p>
                  <p className="muted">Due {formatDate(item.due_date)} · {formatDate(item.created_at)}</p>
                </div>
                <div className="actions">
                  <span className="badge">{item.notification_type.replaceAll('_', ' ')}</span>
                  {!item.is_read && (
                    <button type="button" className="ghost" onClick={() => markRead(item.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
