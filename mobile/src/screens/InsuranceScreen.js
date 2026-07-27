import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, Alert } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'
import EditModal, { Field } from '../components/EditModal'
import { colors, formatDate, formatMoney } from '../theme'

export default function InsuranceScreen() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  const load = useCallback(async () => {
    try {
      setItems(await api('/api/insurance'))
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

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name,
      provider: item.provider,
      policy_number: item.policy_number,
      insurance_type: item.insurance_type,
      sum_assured: String(item.sum_assured ?? ''),
      premium_amount: String(item.premium_amount ?? ''),
      premium_frequency: item.premium_frequency || 'yearly',
      start_date: item.start_date,
      renewal_date: item.renewal_date,
      notes: item.notes || '',
    })
  }

  async function save() {
    try {
      await api(`/api/insurance/${editing.id}`, {
        method: 'PUT',
        body: {
          ...form,
          sum_assured: Number(form.sum_assured || 0),
          premium_amount: Number(form.premium_amount || 0),
        },
      })
      await load()
      const refreshed = await api('/api/insurance')
      const current = refreshed.find((i) => i.id === editing.id)
      if (current) setEditing(current)
      Alert.alert('Saved', 'Policy updated')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
        ListEmptyComponent={<Text style={styles.muted}>No policies yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openEdit(item)}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.provider} · {item.insurance_type}
            </Text>
            <Text style={styles.meta}>Premium {formatMoney(item.premium_amount)}</Text>
            <Text style={styles.meta}>Renews {formatDate(item.renewal_date)}</Text>
            <Text style={styles.meta}>Docs {item.attachment_count || 0} · Tap to edit / attach</Text>
          </Pressable>
        )}
      />

      <EditModal
        visible={!!editing}
        title="Edit insurance"
        onClose={() => setEditing(null)}
        onSave={save}
      >
        <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="Provider" value={form.provider} onChangeText={(v) => setForm({ ...form, provider: v })} />
        <Field label="Policy number" value={form.policy_number} onChangeText={(v) => setForm({ ...form, policy_number: v })} />
        <Field label="Type" value={form.insurance_type} onChangeText={(v) => setForm({ ...form, insurance_type: v })} />
        <Field label="Sum assured" value={form.sum_assured} onChangeText={(v) => setForm({ ...form, sum_assured: v })} keyboardType="numeric" />
        <Field label="Premium" value={form.premium_amount} onChangeText={(v) => setForm({ ...form, premium_amount: v })} keyboardType="numeric" />
        <Field label="Start date (YYYY-MM-DD)" value={form.start_date} onChangeText={(v) => setForm({ ...form, start_date: v })} />
        <Field label="Renewal date (YYYY-MM-DD)" value={form.renewal_date} onChangeText={(v) => setForm({ ...form, renewal_date: v })} />
        <Field label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />
        {editing && <AttachmentsPanel entityType="insurance" entityId={editing.id} onChanged={load} />}
      </EditModal>
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
  error: { color: colors.negative, marginBottom: 8 },
})
