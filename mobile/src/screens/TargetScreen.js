import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import { colors, formatDate, formatMoney } from '../theme'

const emptyForm = {
  name: 'Net worth target',
  target_amount: '',
  target_date: '',
  is_active: true,
  notes: '',
}

export default function TargetScreen() {
  const [goals, setGoals] = useState([])
  const [netWorth, setNetWorth] = useState(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [g, nw] = await Promise.all([api('/api/goals'), api('/api/networth')])
      setGoals(g)
      setNetWorth(nw)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name || 'Net worth target',
      target_amount: String(item.target_amount ?? ''),
      target_date: item.target_date || '',
      is_active: item.is_active !== false,
      notes: item.notes || '',
    })
    setOpen(true)
  }

  async function save() {
    try {
      const body = {
        ...form,
        target_amount: Number(form.target_amount || 0),
        notes: form.notes || null,
      }
      if (editing) await api(`/api/goals/${editing.id}`, { method: 'PUT', body })
      else {
        await api('/api/goals', { method: 'POST', body })
        setOpen(false)
      }
      await load()
      Alert.alert('Saved')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  async function remove(item) {
    Alert.alert('Delete target', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api(`/api/goals/${item.id}`, { method: 'DELETE' })
          await load()
        },
      },
    ])
  }

  const active = goals.find((g) => g.is_active)
  const gap = active && netWorth ? Number(active.target_amount) - Number(netWorth.net_worth) : null

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={goals}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.card}>
              <Text style={styles.muted}>Current net worth</Text>
              <Text style={styles.stat}>{formatMoney(netWorth?.net_worth || 0)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.muted}>Active target</Text>
              <Text style={styles.stat}>{active ? formatMoney(active.target_amount) : '—'}</Text>
              <Text style={styles.muted}>
                {active ? `by ${formatDate(active.target_date)}` : 'No active target'}
                {gap != null ? ` · gap ${formatMoney(gap)}` : ''}
              </Text>
            </View>
            <Pressable style={styles.primary} onPress={openCreate}>
              <Text style={styles.primaryText}>Set target</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={<Text style={styles.muted}>No targets yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openEdit(item)}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.meta}>{formatMoney(item.target_amount)}</Text>
            <Text style={styles.muted}>
              {formatDate(item.target_date)} · {item.is_active ? 'Active' : 'Inactive'}
            </Text>
            <Pressable onPress={() => remove(item)} style={{ marginTop: 8 }}>
              <Text style={styles.danger}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{editing ? 'Edit target' : 'Set target'}</Text>
            <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {[
                ['name', 'Name'],
                ['target_amount', 'Target amount'],
                ['target_date', 'Target date YYYY-MM-DD'],
                ['notes', 'Notes'],
              ].map(([key, label]) => (
                <View key={key} style={{ gap: 6 }}>
                  <Text style={styles.muted}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    placeholderTextColor={colors.muted}
                    value={String(form[key] ?? '')}
                    onChangeText={(v) => setForm({ ...form, [key]: v })}
                  />
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.primary} onPress={save}>
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
            <Pressable style={[styles.ghost, { marginTop: 8 }]} onPress={() => setOpen(false)}>
              <Text style={styles.ghostText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  title: { color: colors.ink, fontWeight: '700', fontSize: 17 },
  muted: { color: colors.muted },
  meta: { color: colors.ink, marginTop: 4, fontWeight: '600' },
  stat: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 4 },
  error: { color: colors.negative },
  danger: { color: colors.negative, fontWeight: '700' },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#1a1208', fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#152821',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    backgroundColor: 'rgba(8,16,13,0.45)',
  },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink, fontWeight: '600' },
})
