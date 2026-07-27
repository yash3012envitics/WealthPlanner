import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function boot() {
      const saved = await AsyncStorage.getItem('wp_token')
      if (!saved) {
        setLoading(false)
        return
      }
      setToken(saved)
      try {
        setUser(await api('/api/auth/me'))
      } catch {
        await AsyncStorage.removeItem('wp_token')
        setToken(null)
      } finally {
        setLoading(false)
      }
    }
    boot()
  }, [])

  const login = useCallback(async (email, password) => {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)
    const data = await api('/api/auth/login', { method: 'POST', body })
    await AsyncStorage.setItem('wp_token', data.access_token)
    setToken(data.access_token)
    setUser(await api('/api/auth/me'))
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

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem('wp_token')
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ token, user, loading, login, register, logout }),
    [token, user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
