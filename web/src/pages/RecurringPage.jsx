import { useEffect, useState } from 'react'
import { api, formatDate, formatMoney } from '../api'

const emptyForm = {
  name: '',
  plan_kind: 'premium',
  frequency: 'yearly',
  installment_amount: '',
  start_date: '',
  term_years: '',
  total_installments: '',
  end_date: '',
  entity_type: '',
  entity_id: '',
  notes: '',
}

export default function RecurringPage() {
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [insurance, setInsurance] = useState([])
  const [investments, setInvestments] = useState([])
  const [liabilities, setLiabilities] = useState([])
  const [assets, setAssets] = useState([])

  async function load() {
    const [planList, policies, holdings, debts, otherAssets] = await Promise.all([
      api('/api/recurring/plans'),
      api('/api/insurance'),
      api('/api/investments'),
      api('/api/liabilities'),
      api('/api/assets'),
    ])
    setPlans(planList)
    setInsurance(policies)
    setInvestments(holdings)
    setLiabilities(debts)
    setAssets(otherAssets)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function openPlan(id) {
    setSelected(await api(`/api/recurring/plans/${id}`))
  }

  async function onCreate(e) {
    e.preventDefault()
    setError('')
    try {
      const body = {
        name: form.name,
        plan_kind: form.plan_kind,
        frequency: form.frequency,
        installment_amount: Number(form.installment_amount),
        start_date: form.start_date,
        auto_notify: true,
        notes: form.notes || null,
      }
      if (form.end_date) body.end_date = form.end_date
      if (form.term_years) body.term_years = Number(form.term_years)
      if (form.total_installments) body.total_installments = Number(form.total_installments)
      if (form.entity_type && form.entity_id) {
        body.entity_type = form.entity_type
        body.entity_id = Number(form.entity_id)
      }
      const plan = await api('/api/recurring/plans', { method: 'POST', body })
      setOpen(false)
      setForm(emptyForm)
      await load()
      setSelected(plan)
    } catch (err) {
      setError(err.message)
    }
  }

  async function markPaid(row) {
    await api(`/api/recurring/installments/${row.id}`, { method: 'PATCH', body: { status: 'paid' } })
    if (selected) setSelected(await api(`/api/recurring/plans/${selected.id}`))
    await load()
  }

  async function deleteInstallment(row) {
    if (!window.confirm(`Delete installment #${row.sequence_no} due ${row.due_date}?`)) return
    await api(`/api/recurring/installments/${row.id}`, { method: 'DELETE' })
    if (selected) setSelected(await api(`/api/recurring/plans/${selected.id}`))
    await load()
  }

  async function removePlan(id) {
    await api(`/api/recurring/plans/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    await load()
  }

  const linkOptions =
    form.entity_type === 'insurance'
      ? insurance
      : form.entity_type === 'investment'
        ? investments
        : form.entity_type === 'liability'
          ? liabilities
          : form.entity_type === 'asset'
            ? assets
            : []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Recurring</h1>
          <p>Premiums, SIPs, and EMIs — child installments are generated automatically for the full term.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          New recurring plan
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="grid grid-2">
        <section className="card">
          <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Plans</h3>
          {plans.length === 0 ? (
            <p className="empty">No recurring plans yet.</p>
          ) : (
            <div className="list">
              {plans.map((plan) => (
                <div className="list-item" key={plan.id}>
                  <div>
                    <strong>{plan.name}</strong>
                    <p className="muted">
                      {plan.plan_kind} · {plan.frequency} · {formatMoney(plan.installment_amount)}
                    </p>
                    <p className="muted">
                      {plan.summary.paid_count}/{plan.total_installments} paid · remaining{' '}
                      {formatMoney(plan.summary.remaining_amount)}
                    </p>
                  </div>
                  <div className="actions">
                    <button type="button" className="ghost" onClick={() => openPlan(plan.id)}>
                      Open
                    </button>
                    <button type="button" className="danger" onClick={() => removePlan(plan.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
            {selected ? selected.name : 'Select a plan'}
          </h3>
          {!selected ? (
            <p className="empty">Open a plan to see every generated installment.</p>
          ) : (
            <>
              <p className="muted">
                {formatDate(selected.start_date)} → {formatDate(selected.end_date)} · {selected.frequency} ·{' '}
                {selected.total_installments} installments
              </p>
              <div className="table-wrap" style={{ marginTop: 12 }}>
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
                            {row.status !== 'paid' && (
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
            </>
          )}
        </section>
      </div>

      {open && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <h2>New recurring plan</h2>
            <form className="form-grid" onSubmit={onCreate}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Kind
                <select value={form.plan_kind} onChange={(e) => setForm({ ...form, plan_kind: e.target.value })}>
                  <option value="premium">Insurance premium</option>
                  <option value="sip">Mutual fund SIP</option>
                  <option value="emi">Loan EMI</option>
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
                <input type="number" step="any" value={form.term_years} onChange={(e) => setForm({ ...form, term_years: e.target.value })} placeholder="10" />
              </label>
              <label>
                Or total installments
                <input type="number" value={form.total_installments} onChange={(e) => setForm({ ...form, total_installments: e.target.value })} />
              </label>
              <label>
                Or end date
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </label>
              <label>
                Link to
                <select
                  value={form.entity_type}
                  onChange={(e) => setForm({ ...form, entity_type: e.target.value, entity_id: '' })}
                >
                  <option value="">None</option>
                  <option value="insurance">Insurance</option>
                  <option value="investment">Investment / MF</option>
                  <option value="asset">Other asset</option>
                  <option value="liability">Liability</option>
                </select>
              </label>
              <label>
                Record
                <select
                  value={form.entity_id}
                  onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
                  disabled={!form.entity_type}
                >
                  <option value="">Select…</option>
                  {linkOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">
                Notes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="actions full">
                <button type="submit">Generate installments</button>
                <button type="button" className="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
