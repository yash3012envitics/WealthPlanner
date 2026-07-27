import { useCallback, useMemo, useState } from 'react'
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
import { colors, formatMoney } from '../theme'

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']

const emptyForm = {
  name: '',
  amount: '',
  frequency: 'monthly',
  category: '',
  is_active: true,
  notes: '',
}

function currentMonthValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function CashflowScreen() {
  const [tab, setTab] = useState('defaults')
  const [kind, setKind] = useState('income')
  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [monthValue, setMonthValue] = useState(currentMonthValue)
  const [monthData, setMonthData] = useState(null)
  const [overrideDrafts, setOverrideDrafts] = useState({})
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [oneOff, setOneOff] = useState({ name: '', amount: '' })
  const [error, setError] = useState('')

  const { year, month } = useMemo(() => {
    const [y, m] = monthValue.split('-').map(Number)
    return { year: y, month: m }
  }, [monthValue])

  const load = useCallback(async () => {
    try {
      const [i, e, m] = await Promise.all([
        api('/api/income'),
        api('/api/expenses'),
        api(`/api/cashflow/month?year=${year}&month=${month}`),
      ])
      setIncomes(i)
      setExpenses(e)
      setMonthData(m)
      const next = {}
      m.income_lines.forEach((line) => {
        if (line.entry_id != null) next[`income-${line.entry_id}`] = String(line.amount)
      })
      m.expense_lines.forEach((line) => {
        if (line.entry_id != null) next[`expense-${line.entry_id}`] = String(line.amount)
      })
      setOverrideDrafts(next)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [year, month])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  function openCreate() {
    setEditing(null)
    setForm({
      ...emptyForm,
      category: kind === 'income' ? 'salary' : 'living',
    })
    setOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name,
      amount: String(item.amount ?? ''),
      frequency: item.frequency || 'monthly',
      category: item.category || '',
      is_active: item.is_active !== false,
      notes: item.notes || '',
    })
    setOpen(true)
  }

  async function saveDefault() {
    try {
      const body = {
        ...form,
        amount: Number(form.amount || 0),
        notes: form.notes || null,
      }
      const base = kind === 'income' ? '/api/income' : '/api/expenses'
      if (editing) await api(`${base}/${editing.id}`, { method: 'PUT', body })
      else {
        await api(base, { method: 'POST', body })
        setOpen(false)
      }
      await load()
      Alert.alert('Saved')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  async function removeDefault(item) {
    Alert.alert('Delete', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const base = kind === 'income' ? '/api/income' : '/api/expenses'
          await api(`${base}/${item.id}`, { method: 'DELETE' })
          await load()
        },
      },
    ])
  }

  async function saveOverride(entryId) {
    try {
      const key = `${kind}-${entryId}`
      const path = kind === 'income' ? `/api/cashflow/income/${year}/${month}` : `/api/cashflow/expenses/${year}/${month}`
      await api(path, { method: 'PUT', body: { entry_id: entryId, amount: Number(overrideDrafts[key] || 0) } })
      await load()
      Alert.alert('Saved', 'Month amount saved')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  async function clearOverride(overrideId) {
    if (!overrideId) return
    const path =
      kind === 'income' ? `/api/cashflow/income-overrides/${overrideId}` : `/api/cashflow/expense-overrides/${overrideId}`
    await api(path, { method: 'DELETE' })
    await load()
  }

  async function addOneOff() {
    try {
      const path = kind === 'income' ? `/api/cashflow/income/${year}/${month}` : `/api/cashflow/expenses/${year}/${month}`
      await api(path, {
        method: 'PUT',
        body: { entry_id: null, name: oneOff.name, amount: Number(oneOff.amount || 0) },
      })
      setOneOff({ name: '', amount: '' })
      await load()
    } catch (err) {
      Alert.alert('Failed', err.message)
    }
  }

  const defaults = kind === 'income' ? incomes : expenses
  const monthLines = (kind === 'income' ? monthData?.income_lines : monthData?.expense_lines) || []
  const linked = monthLines.filter((l) => l.entry_id != null)
  const oneOffs = monthLines.filter((l) => l.source === 'one_off')
  const listData = tab === 'defaults' ? defaults : linked

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={listData}
        keyExtractor={(item) => String(item.id || item.entry_id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.card}>
              <Text style={styles.muted}>Defaults · income {formatMoney(monthData?.default_income_total || 0)}</Text>
              <Text style={styles.muted}>Defaults · expenses {formatMoney(monthData?.default_expense_total || 0)}</Text>
              <Text style={styles.stat}>{monthData?.label || monthValue}</Text>
              <Text style={styles.muted}>
                Income {formatMoney(monthData?.income_total || 0)} · Expenses {formatMoney(monthData?.expense_total || 0)}
              </Text>
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.chip, tab === 'defaults' && styles.chipOn]} onPress={() => setTab('defaults')}>
                <Text style={styles.chipText}>Defaults</Text>
              </Pressable>
              <Pressable style={[styles.chip, tab === 'month' && styles.chipOn]} onPress={() => setTab('month')}>
                <Text style={styles.chipText}>Month</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.chip, kind === 'income' && styles.chipOn]} onPress={() => setKind('income')}>
                <Text style={styles.chipText}>Income</Text>
              </Pressable>
              <Pressable style={[styles.chip, kind === 'expense' && styles.chipOn]} onPress={() => setKind('expense')}>
                <Text style={styles.chipText}>Expenses</Text>
              </Pressable>
            </View>
            {tab === 'month' ? (
              <View style={styles.card}>
                <Text style={styles.muted}>Month YYYY-MM</Text>
                <TextInput
                  style={styles.input}
                  placeholderTextColor={colors.muted}
                  value={monthValue}
                  onChangeText={setMonthValue}
                />
              </View>
            ) : (
              <Pressable style={styles.primary} onPress={openCreate}>
                <Text style={styles.primaryText}>Add default {kind}</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={<Text style={styles.muted}>{tab === 'defaults' ? 'No defaults yet.' : 'Add defaults first.'}</Text>}
        renderItem={({ item }) =>
          tab === 'defaults' ? (
            <Pressable style={styles.card} onPress={() => openEdit(item)}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.muted}>
                {formatMoney(item.amount)} · {item.frequency} → {formatMoney(item.monthly_amount)}/mo
              </Text>
              <Pressable onPress={() => removeDefault(item)} style={{ marginTop: 8 }}>
                <Text style={styles.danger}>Delete</Text>
              </Pressable>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.muted}>Default {formatMoney(item.default_amount)} · {item.source}</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={overrideDrafts[`${kind}-${item.entry_id}`] ?? String(item.amount)}
                onChangeText={(v) => setOverrideDrafts({ ...overrideDrafts, [`${kind}-${item.entry_id}`]: v })}
              />
              <View style={styles.row}>
                <Pressable style={styles.primary} onPress={() => saveOverride(item.entry_id)}>
                  <Text style={styles.primaryText}>Save month</Text>
                </Pressable>
                {item.override_id ? (
                  <Pressable style={styles.ghost} onPress={() => clearOverride(item.override_id)}>
                    <Text style={styles.ghostText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )
        }
        ListFooterComponent={
          tab === 'month' ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Text style={styles.title}>One-off {kind}</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor={colors.muted}
                value={oneOff.name}
                onChangeText={(v) => setOneOff({ ...oneOff, name: v })}
              />
              <TextInput
                style={styles.input}
                placeholder="Amount"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={oneOff.amount}
                onChangeText={(v) => setOneOff({ ...oneOff, amount: v })}
              />
              <Pressable style={styles.primary} onPress={addOneOff}>
                <Text style={styles.primaryText}>Add one-off</Text>
              </Pressable>
              {oneOffs.map((line) => (
                <View key={line.override_id} style={styles.card}>
                  <Text style={styles.title}>{line.name}</Text>
                  <Text style={styles.muted}>{formatMoney(line.amount)}</Text>
                  <Pressable onPress={() => clearOverride(line.override_id)}>
                    <Text style={styles.danger}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null
        }
      />

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{editing ? 'Edit' : 'Add'} default {kind}</Text>
            <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {[
                ['name', 'Name'],
                ['amount', 'Amount'],
                ['frequency', `Frequency (${FREQUENCIES.join('/')})`],
                ['category', 'Category'],
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
            <Pressable style={styles.primary} onPress={saveDefault}>
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
  stat: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 4 },
  error: { color: colors.negative },
  danger: { color: colors.negative, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  chipOn: { borderColor: colors.accent, backgroundColor: 'rgba(212,175,106,0.12)' },
  chipText: { color: colors.ink, fontWeight: '600' },
  primary: {
    flex: 1,
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
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink, fontWeight: '600' },
})
