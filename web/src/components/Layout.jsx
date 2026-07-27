import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Net Worth', end: true },
  { to: '/insurance', label: 'Insurance' },
  { to: '/investments', label: 'Investments' },
  { to: '/recurring', label: 'Recurring' },
  { to: '/cashflow', label: 'Cashflow' },
  { to: '/target', label: 'Target' },
  { to: '/plan', label: 'Plan' },
  { to: '/properties', label: 'Property' },
  { to: '/assets', label: 'Other assets' },
  { to: '/liabilities', label: 'Liabilities' },
  { to: '/notifications', label: 'Alerts' },
]

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">WP</span>
          <div>
            <strong>WealthPlanner</strong>
            <p>Portfolio & protection</p>
          </div>
        </div>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>
            <strong>{user?.full_name}</strong>
            <p>{user?.email}</p>
          </div>
          <button type="button" className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
