import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'

export default function LoginScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('maulik@wealthplanner.app')
  const [password, setPassword] = useState('demo1234')
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(fullName, email, password)
    } catch (err) {
      Alert.alert('Unable to continue', err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Personal portfolio OS</Text>
      <Text style={styles.title}>WealthPlanner</Text>
      <Text style={styles.sub}>Insurance, investments, property, and live net worth — with renewal alerts.</Text>

      {mode === 'register' && (
        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={colors.muted} value={fullName} onChangeText={setFullName} />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.button} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Text>
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
        <Text style={styles.switch}>
          {mode === 'login' ? 'New here? Create account' : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  kicker: { color: colors.muted },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '700',
  },
  sub: { color: colors.muted, marginBottom: 12, lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    color: colors.ink,
    backgroundColor: 'rgba(8,16,13,0.45)',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#1a1208', fontWeight: '700' },
  switch: { color: colors.accent, textAlign: 'center', marginTop: 8 },
})
