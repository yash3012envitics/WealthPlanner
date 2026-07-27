import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('wp_token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }
      try {
        const me = await api('/api/auth/me')
        setUser(me)
      } catch {
        localStorage.removeItem('wp_token')
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const login = useCallback(async (email, password) => {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)
    const data = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    localStorage.setItem('wp_token', data.access_token)
    setToken(data.access_token)
  }, [])

  const register = useCallback(
    async (fullName, email, password) => {
      await api('/api/auth/register', {
        method: 'POST',
        body: { full_name: fullName, email, password },
      })
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(() => {
    localStorage.removeItem('wp_token')
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
