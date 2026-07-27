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
  name: '',
  plan_kind: 'premium',
  frequency: 'yearly',
  installment_amount: '',
  start_date: '',
  term_years: '',
  total_installments: '',
  notes: '',
}

export default function RecurringScreen() {
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setPlans(await api('/api/recurring/plans'))
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

  async function openPlan(id) {
    setSelected(await api(`/api/recurring/plans/${id}`))
  }

  async function createPlan() {
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
      if (form.term_years) body.term_years = Number(form.term_years)
      if (form.total_installments) body.total_installments = Number(form.total_installments)
      const plan = await api('/api/recurring/plans', { method: 'POST', body })
      setCreateOpen(false)
      setForm(emptyForm)
      await load()
      setSelected(plan)
      Alert.alert('Created', `${plan.total_installments} installments generated`)
    } catch (err) {
      Alert.alert('Create failed', err.message)
    }
  }

  async function markPaid(row) {
    await api(`/api/recurring/installments/${row.id}`, { method: 'PATCH', body: { status: 'paid' } })
    if (selected) setSelected(await api(`/api/recurring/plans/${selected.id}`))
    await load()
  }

  async function deleteInstallment(row) {
    Alert.alert('Delete installment', `Remove #${row.sequence_no} due ${row.due_date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/api/recurring/installments/${row.id}`, { method: 'DELETE' })
            if (selected) setSelected(await api(`/api/recurring/plans/${selected.id}`))
            await load()
          } catch (err) {
            Alert.alert('Delete failed', err.message)
          }
        },
      },
    ])
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={plans}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 8 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.primary} onPress={() => setCreateOpen(true)}>
              <Text style={styles.primaryText}>New recurring plan</Text>
            </Pressable>
            <Text style={styles.muted}>Premiums, SIPs, EMIs — children are auto-generated for the full term.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.muted}>No recurring plans yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openPlan(item.id)}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.plan_kind} · {item.frequency} · {formatMoney(item.installment_amount)}
            </Text>
            <Text style={styles.meta}>
              {item.summary.paid_count}/{item.total_installments} paid · next{' '}
              {item.summary.next_due_date ? formatDate(item.summary.next_due_date) : '—'}
            </Text>
          </Pressable>
        )}
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{selected?.name}</Text>
            <Text style={styles.muted}>
              {selected ? `${formatDate(selected.start_date)} → ${formatDate(selected.end_date)}` : ''}
            </Text>
            <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {(selected?.installments || []).map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>
                      #{row.sequence_no} · {formatDate(row.due_date)}
                    </Text>
                    <Text style={styles.muted}>
                      {formatMoney(row.amount)} · {row.status}
                    </Text>
                  </View>
                  {row.status !== 'paid' && (
                    <Pressable onPress={() => markPaid(row)}>
                      <Text style={styles.link}>Mark paid</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => deleteInstallment(row)}>
                    <Text style={styles.danger}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.ghost} onPress={() => setSelected(null)}>
              <Text style={styles.ghostText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>New recurring plan</Text>
            <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {[
                ['name', 'Name'],
                ['plan_kind', 'Kind (premium/sip/emi/other)'],
                ['frequency', 'Frequency (monthly/quarterly/half_yearly/yearly)'],
                ['installment_amount', 'Installment amount'],
                ['start_date', 'Start date YYYY-MM-DD'],
                ['term_years', 'Term years (e.g. 10)'],
                ['total_installments', 'Or total installments'],
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
            <Pressable style={styles.primary} onPress={createPlan}>
              <Text style={styles.primaryText}>Generate installments</Text>
            </Pressable>
            <Pressable style={[styles.ghost, { marginTop: 8 }]} onPress={() => setCreateOpen(false)}>
              <Text style={styles.ghostText}>Cancel</Text>
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
  meta: { color: colors.ink, marginTop: 4 },
  error: { color: colors.negative },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#1a1208', fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#152821',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  itemTitle: { color: colors.ink, fontWeight: '600' },
  link: { color: colors.accent, fontWeight: '700' },
  danger: { color: colors.negative, fontWeight: '700' },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    backgroundColor: 'rgba(8,16,13,0.45)',
  },
})
