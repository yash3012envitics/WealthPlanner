import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatDate, formatMoney } from '../api'

/** Client-side fallback if API hasn't returned invest_options yet */
function resolveInvestOptions(row, plan) {
  const amount = Number(row?.suggested_invest || 0)
  if (amount <= 0) return []
  if (row?.invest_options?.length) return row.invest_options
  const template = plan?.invest_options || []
  if (template.length) {
    return template.map((opt) => ({
      ...opt,
      amount: Math.round(((amount * Number(opt.percent || 0)) / 100) * 100) / 100,
    }))
  }
  // Last-resort diversified mix (~12%+ blended, India + global)
  const mix = [
    { label: 'Nifty 50 / Large-cap index (TRI)', risk: 'moderate', percent: 22, expected_return: 0.125, track_record: '~12.5% CAGR / 20Y' },
    { label: 'Flexi / Multi-cap equity funds', risk: 'moderate', percent: 18, expected_return: 0.135, track_record: '~13–15% long horizon' },
    { label: 'Mid-cap equity (index or active)', risk: 'moderate_aggressive', percent: 15, expected_return: 0.15, track_record: '~15% CAGR / 20Y midcap TRI' },
    { label: 'US equity FoF / S&P 500 (INR)', risk: 'moderate', percent: 15, expected_return: 0.145, track_record: '~15% CAGR / 20Y in INR' },
    { label: 'Large & Mid Cap / Nifty Next 50', risk: 'moderate', percent: 12, expected_return: 0.135, track_record: 'Between large & mid long term' },
    { label: 'Gold ETF / FoF (INR hedge)', risk: 'safe', percent: 10, expected_return: 0.10, track_record: 'Long-term INR hedge' },
    { label: 'Arbitrage / short-duration debt', risk: 'safe', percent: 8, expected_return: 0.07, track_record: '~7–8% debt history' },
  ]
  return mix.map((opt) => ({
    ...opt,
    amount: Math.round(((amount * opt.percent) / 100) * 100) / 100,
  }))
}

function StrategyOptionsCell({ row, plan }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const hideTimer = useRef(null)
  const options = resolveInvestOptions(row, plan)

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  if (!options.length) return <span className="muted">—</span>

  const total = options.reduce((sum, opt) => sum + Number(opt.amount || 0), 0)
  const blended = ((plan.invest_options_blended_return ?? 0.12) * 100).toFixed(1)

  function cancelHide() {
    clearTimeout(hideTimer.current)
  }

  function scheduleHide() {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setOpen(false), 150)
  }

  function showTip(event) {
    cancelHide()
    const rect = event.currentTarget.getBoundingClientRect()
    const panelWidth = Math.min(560, window.innerWidth * 0.7)
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - panelWidth - 12)
    const preferBelow = rect.bottom + 12
    const top = preferBelow + 280 > window.innerHeight ? Math.max(12, rect.top - 290) : preferBelow
    setPos({ top, left })
    setOpen(true)
  }

  return (
    <div className="strategy-tip" onMouseEnter={showTip} onMouseLeave={scheduleHide}>
      <button type="button" className="strategy-tip-trigger" onFocus={showTip} onBlur={scheduleHide}>
        {formatMoney(total)}
        <span className="muted"> · hover</span>
      </button>
      {open && (
        <div
          className="strategy-tip-panel strategy-tip-panel-fixed"
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <p className="strategy-tip-title">Suggested strategy · ~{blended}% blended</p>
          <table className="strategy-tip-table">
            <thead>
              <tr>
                <th>Option</th>
                <th>%</th>
                <th>Amount</th>
                <th>Exp.</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {options.map((opt) => (
                <tr key={opt.label}>
                  <td>
                    <strong>{opt.label}</strong>
                    {opt.track_record ? <div className="muted strategy-tip-meta">Track: {opt.track_record}</div> : null}
                    {opt.rationale ? <div className="muted strategy-tip-meta">Why: {opt.rationale}</div> : null}
                  </td>
                  <td>{opt.percent}%</td>
                  <td>{formatMoney(opt.amount)}</td>
                  <td>~{((opt.expected_return || 0) * 100).toFixed(1)}%</td>
                  <td>{String(opt.risk || '').replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PlanPage() {
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setPlan(await api('/api/plan'))
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  if (!plan && !error) return <div className="boot">Building your plan…</div>

  const delta = plan?.suggested_invest_delta ?? 0
  const deltaLabel =
    delta > 0
      ? `Add ₹${Math.abs(delta).toLocaleString('en-IN')} / month beyond SIPs`
      : delta === 0
        ? 'No extra invest beyond current SIPs'
        : `You can invest ₹${Math.abs(delta).toLocaleString('en-IN')} less / month`
  const returnPct = ((plan?.expected_annual_return ?? 0.12) * 100).toFixed(1)
  const spendTotal =
    (plan?.suggested_monthly_spend ??
      (plan?.monthly_expenses || 0) + (plan?.monthly_other_invest || plan?.monthly_premiums || 0) + (plan?.monthly_sip || 0))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Wealth plan</h1>
          <p>
            Month-by-month spend and invest guidance from cashflow, active mutual-fund SIPs, and compounded market
            growth toward your target.
          </p>
        </div>
        <div className="actions">
          <Link className="ghost" to="/cashflow" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.6rem 1rem' }}>
            Cashflow
          </Link>
          <Link className="ghost" to="/target" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.6rem 1rem' }}>
            Target
          </Link>
          <button type="button" onClick={() => load().catch((err) => setError(err.message))}>
            Refresh
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!plan && <p className="empty">Unable to load plan.</p>}

      {plan && (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <p className="stat-label">Summary</p>
            <p style={{ marginTop: 8, lineHeight: 1.5 }}>{plan.summary}</p>
            {plan.warnings?.length > 0 && (
              <ul className="muted" style={{ marginTop: 12 }}>
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              Status:{' '}
              {plan.target_amount == null
                ? 'Needs target'
                : plan.feasible
                  ? plan.on_track
                    ? 'On track'
                    : 'Feasible'
                  : 'Needs more surplus or a later date'}
              {' · '}Assumed return {returnPct}%/yr
              {plan.projected_net_worth_at_target
                ? ` · Projected NW ${formatMoney(plan.projected_net_worth_at_target)}`
                : ''}
            </p>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <section className="card">
              <p className="stat-label">Spend / mo</p>
              <div className="stat-value">{formatMoney(spendTotal)}</div>
              <p className="muted">
                Expenses {formatMoney(plan.monthly_expenses)} + Other invest{' '}
                {formatMoney(plan.monthly_other_invest ?? plan.monthly_premiums)} + SIP{' '}
                {formatMoney(plan.monthly_sip)}
              </p>
            </section>
            <section className="card">
              <p className="stat-label">Suggested invest / mo</p>
              <div className="stat-value">{formatMoney(plan.suggested_monthly_invest)}</div>
              <p className="muted">{deltaLabel}</p>
            </section>
            <section className="card">
              <p className="stat-label">Required total invest / mo</p>
              <div className="stat-value">{formatMoney(plan.required_monthly_invest)}</div>
              <p className="muted">
                with {returnPct}% compounding · after SIP need {formatMoney(plan.suggested_monthly_invest)}
              </p>
            </section>
            <section className="card">
              <p className="stat-label">Gap to target</p>
              <div className="stat-value">{formatMoney(plan.gap)}</div>
              <p className="muted">
                {plan.target_date ? `by ${formatDate(plan.target_date)} · ${plan.months_remaining} mo` : '—'}
              </p>
            </section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            <section className="card">
              <p className="stat-label">Income / mo (this month)</p>
              <strong>{formatMoney(plan.monthly_income)}</strong>
              <p className="muted">Default {formatMoney(plan.default_monthly_income)}</p>
            </section>
            <section className="card">
              <p className="stat-label">Living expenses / mo</p>
              <strong>{formatMoney(plan.monthly_expenses)}</strong>
              <p className="muted">Default {formatMoney(plan.default_monthly_expenses)}</p>
            </section>
            <section className="card">
              <p className="stat-label">Other invest / mo</p>
              <strong>{formatMoney(plan.monthly_other_invest ?? plan.monthly_premiums)}</strong>
              <p className="muted">Insurance premiums etc.</p>
            </section>
            <section className="card">
              <p className="stat-label">Current SIPs / mo</p>
              <strong>{formatMoney(plan.monthly_sip)}</strong>
              <p className="muted">{(plan.sip_lines || []).length} active plan(s)</p>
            </section>
            <section className="card">
              <p className="stat-label">EMI / mo</p>
              <strong>{formatMoney(plan.monthly_emi)}</strong>
            </section>
            <section className="card">
              <p className="stat-label">Surplus / mo</p>
              <strong>{formatMoney(plan.surplus)}</strong>
              <p className="muted">Income − Spend − EMI</p>
            </section>
            <section className="card">
              <p className="stat-label">Current net worth</p>
              <strong>{formatMoney(plan.current_net_worth)}</strong>
            </section>
          </div>


          <section className="card table-wrap">
            <h2 style={{ marginBottom: 12, fontSize: '1.1rem' }}>Month-by-month</h2>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Other Invest</th>
                  <th>Inv in SIP</th>
                  <th>Spend</th>
                  <th>Suggested Invest</th>
                  <th>Suggested options (~{(((plan.invest_options_blended_return ?? plan.expected_annual_return ?? 0.12) * 100).toFixed(0))}%)</th>
                  <th>Projected NW</th>
                </tr>
              </thead>
              <tbody>
                {(plan.months || []).map((row) => (
                  <tr key={`${row.year}-${row.month}`}>
                    <td>
                      {row.label}
                      <div className="muted">
                        {row.income_source !== 'defaults' || row.expense_source !== 'defaults'
                          ? 'uses month overrides'
                          : 'defaults'}
                      </div>
                    </td>
                    <td>{formatMoney(row.income)}</td>
                    <td>{formatMoney(row.expenses)}</td>
                    <td>{formatMoney(row.other_invest ?? plan.monthly_other_invest ?? plan.monthly_premiums)}</td>
                    <td>{formatMoney(row.monthly_invested ?? plan.monthly_sip)}</td>
                    <td>
                      {formatMoney(
                        row.suggested_spend ??
                          (row.expenses || 0) +
                            (row.other_invest ?? plan.monthly_other_invest ?? plan.monthly_premiums ?? 0) +
                            (row.monthly_invested ?? plan.monthly_sip ?? 0),
                      )}
                    </td>
                    <td>{formatMoney(row.suggested_invest)}</td>
                    <td>
                      <StrategyOptionsCell row={row} plan={plan} />
                    </td>
                    <td>{formatMoney(row.projected_net_worth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(plan.months || []).length === 0 && (
              <p className="empty">Add a target date in the future to see the month-wise schedule.</p>
            )}
            <p className="muted" style={{ marginTop: 12 }}>
              {plan.invest_options_note ||
                `Best 5–7 options for additional invest, diversified to maximize odds of ~${(
                  ((plan.invest_options_blended_return ?? 0.12) * 100).toFixed(1)
                )}% long-term return (India + global multi-decade data). Illustrative only.`}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
