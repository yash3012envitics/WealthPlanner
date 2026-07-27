import { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '../api'

/**
 * Recurring premium / SIP plans linked to a parent record (insurance, investment, liability).
 * Creating a plan auto-generates every installment between start and end.
 */
export default function RecurringPlansPanel({
  entityType,
  entityId,
  defaultKind = 'premium',
  defaultName = '',
  defaultAmount = '',
  defaultFrequency = 'yearly',
  defaultStart = '',
  defaultTermYears = '',
}) {
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: defaultName,
    plan_kind: defaultKind,
    frequency: defaultFrequency,
    installment_amount: defaultAmount,
    start_date: defaultStart,
    term_years: defaultTermYears,
    total_installments: '',
    end_date: '',
    notes: '',
  })

  async function load() {
    if (!entityId) return
    const data = await api(`/api/recurring/plans?entity_type=${entityType}&entity_id=${entityId}`)
    setPlans(data)
  }

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: defaultName || prev.name,
      plan_kind: defaultKind,
      installment_amount: defaultAmount || prev.installment_amount,
      frequency: defaultFrequency,
      start_date: defaultStart || prev.start_date,
      term_years: defaultTermYears || prev.term_years,
    }))
  }, [defaultName, defaultKind, defaultAmount, defaultFrequency, defaultStart, defaultTermYears])

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [entityType, entityId])

  async function openPlan(id) {
    const plan = await api(`/api/recurring/plans/${id}`)
    setSelected(plan)
  }

  async function createPlan(e) {
    e.preventDefault()
    setError('')
    try {
      const body = {
        name: form.name,
        plan_kind: form.plan_kind,
        frequency: form.frequency,
        installment_amount: Number(form.installment_amount),
        start_date: form.start_date,
        entity_type: entityType,
        entity_id: entityId,
        auto_notify: true,
        notes: form.notes || null,
      }
      if (form.end_date) body.end_date = form.end_date
      if (form.term_years) body.term_years = Number(form.term_years)
      if (form.total_installments) body.total_installments = Number(form.total_installments)

      const plan = await api('/api/recurring/plans', { method: 'POST', body })
      await load()
      setSelected(plan)
    } catch (err) {
      setError(err.message)
    }
  }

  async function markPaid(installment) {
    await api(`/api/recurring/installments/${installment.id}`, {
      method: 'PATCH',
      body: { status: 'paid' },
    })
    if (selected) await openPlan(selected.id)
    await load()
  }

  async function markPending(installment) {
    await api(`/api/recurring/installments/${installment.id}`, {
      method: 'PATCH',
      body: { status: 'pending', paid_date: null, paid_amount: null },
    })
    if (selected) await openPlan(selected.id)
    await load()
  }

  async function deleteInstallment(installment) {
    if (!window.confirm(`Delete installment #${installment.sequence_no}?`)) return
    await api(`/api/recurring/installments/${installment.id}`, { method: 'DELETE' })
    if (selected) await openPlan(selected.id)
    await load()
  }

  async function removePlan(id) {
    await api(`/api/recurring/plans/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    await load()
  }

  if (!entityId) {
    return <p className="muted">Save the record first to add recurring premiums / SIPs.</p>
  }

  return (
    <div className="attachments">
      <h3>Recurring installments</h3>
      <p className="muted">
        Define frequency + term (e.g. 10-year yearly premium or monthly SIP). The system creates every child installment
        automatically and notifies you before each due date.
      </p>
      {error && <p className="error">{error}</p>}

      <form className="form-grid" onSubmit={createPlan} style={{ marginTop: 12 }}>
        <label>
          Plan name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Kind
          <select value={form.plan_kind} onChange={(e) => setForm({ ...form, plan_kind: e.target.value })}>
            <option value="premium">Premium</option>
            <option value="sip">SIP</option>
            <option value="emi">EMI</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Frequency
          <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-yearly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          Installment amount
          <input
            type="number"
            step="any"
            value={form.installment_amount}
            onChange={(e) => setForm({ ...form, installment_amount: e.target.value })}
            required
          />
        </label>
        <label>
          Start date
          <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
        </label>
        <label>
          Term (years)
          <input
            type="number"
            step="any"
            value={form.term_years}
            onChange={(e) => setForm({ ...form, term_years: e.target.value })}
            placeholder="e.g. 10"
          />
        </label>
        <label>
          Or total installments
          <input
            type="number"
            value={form.total_installments}
            onChange={(e) => setForm({ ...form, total_installments: e.target.value })}
            placeholder="e.g. 120 for 10y monthly SIP"
          />
        </label>
        <label>
          Or end date
          <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </label>
        <label className="full">
          Notes
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="actions full">
          <button type="submit">Create plan & generate installments</button>
        </div>
      </form>

      <div className="list" style={{ marginTop: 16 }}>
        {plans.length === 0 ? (
          <p className="empty">No recurring plans on this record yet.</p>
        ) : (
          plans.map((plan) => (
            <div className="list-item" key={plan.id}>
              <div>
                <strong>{plan.name}</strong>
                <p className="muted">
                  {plan.plan_kind} · {plan.frequency} · {formatMoney(plan.installment_amount)} · {plan.total_installments}{' '}
                  installments
                </p>
                <p className="muted">
                  {formatDate(plan.start_date)} → {formatDate(plan.end_date)} · Paid {plan.summary.paid_count}/
                  {plan.total_installments}
                  {plan.summary.next_due_date ? ` · Next ${formatDate(plan.summary.next_due_date)}` : ''}
                </p>
              </div>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => openPlan(plan.id)}>
                  View children
                </button>
                <button type="button" className="danger" onClick={() => removePlan(plan.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>
            {selected.name} — child installments
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {selected.installments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sequence_no}</td>
                    <td>{formatDate(row.due_date)}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>
                      <span className="badge">{row.status}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {row.status === 'paid' ? (
                          <button type="button" className="ghost" onClick={() => markPending(row)}>
                            Undo
                          </button>
                        ) : (
                          <button type="button" onClick={() => markPaid(row)}>
                            Mark paid
                          </button>
                        )}
                        <button type="button" className="danger" onClick={() => deleteInstallment(row)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
