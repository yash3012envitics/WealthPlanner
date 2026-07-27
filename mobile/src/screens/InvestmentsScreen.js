import { useCallback, useMemo, useState } from 'react'
import { View, Text, StyleSheet, RefreshControl, Pressable, Alert, SectionList } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import AttachmentsPanel from '../components/AttachmentsPanel'
import EditModal, { Field } from '../components/EditModal'
import { colors, formatMoney } from '../theme'

function summarize(list) {
  const invested = list.reduce((s, i) => s + Number(i.invested_value || 0), 0)
  const current = list.reduce((s, i) => s + Number(i.current_value || 0), 0)
  const gain = current - invested
  const pct = invested ? (gain / invested) * 100 : 0
  return { count: list.length, invested, current, gain, pct }
}

function formatPct(value) {
  const n = Number(value || 0)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export default function InvestmentsScreen() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  const load = useCallback(async () => {
    try {
      setItems(await api('/api/investments'))
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

  const stocks = useMemo(
    () => items.filter((i) => i.investment_type === 'stock' || i.investment_type === 'etf'),
    [items],
  )
  const mutualFunds = useMemo(() => items.filter((i) => i.investment_type === 'mutual_fund'), [items])
  const others = useMemo(
    () => items.filter((i) => !['stock', 'etf', 'mutual_fund'].includes(i.investment_type)),
    [items],
  )
  const stockSummary = useMemo(() => summarize(stocks), [stocks])
  const mfSummary = useMemo(() => summarize(mutualFunds), [mutualFunds])
  const allSummary = useMemo(() => summarize(items), [items])

  const sections = useMemo(
    () =>
      [
        { title: 'Stocks / ETF', data: stocks, summary: stockSummary },
        { title: 'Mutual funds', data: mutualFunds, summary: mfSummary },
        { title: 'Other', data: others, summary: summarize(others) },
      ].filter((s) => s.data.length > 0),
    [stocks, mutualFunds, others, stockSummary, mfSummary],
  )

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name,
      symbol: item.symbol || '',
      investment_type: item.investment_type,
      quantity: String(item.quantity ?? ''),
      buy_price: String(item.buy_price ?? ''),
      current_price: String(item.current_price ?? ''),
      purchase_date: item.purchase_date,
      notes: item.notes || '',
    })
  }

  async function save() {
    try {
      await api(`/api/investments/${editing.id}`, {
        method: 'PUT',
        body: {
          ...form,
          quantity: Number(form.quantity || 0),
          buy_price: Number(form.buy_price || 0),
          current_price: Number(form.current_price || 0),
          symbol: form.symbol || null,
        },
      })
      await load()
      const refreshed = await api('/api/investments')
      const current = refreshed.find((i) => i.id === editing.id)
      if (current) setEditing(current)
      Alert.alert('Saved', 'Investment updated')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  return (
    <>
      <SectionList
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 8 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {[
              { label: 'Stocks / ETF', summary: stockSummary },
              { label: 'Mutual funds', summary: mfSummary },
              { label: 'All holdings', summary: allSummary },
            ].map(({ label, summary }) => (
              <View style={styles.card} key={label}>
                <Text style={styles.muted}>{label}</Text>
                <Text style={styles.stat}>{formatMoney(summary.current)}</Text>
                <Text style={styles.muted}>
                  Invested {formatMoney(summary.invested)} · {summary.count} holdings
                </Text>
                <Text style={{ color: summary.gain >= 0 ? colors.positive : colors.negative, fontWeight: '700' }}>
                  P/L {formatMoney(summary.gain)} ({formatPct(summary.pct)})
                </Text>
              </View>
            ))}
          </View>
        }
        ListEmptyComponent={<Text style={styles.muted}>No holdings yet.</Text>}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={{ color: section.summary.gain >= 0 ? colors.positive : colors.negative, fontWeight: '700' }}>
              {formatMoney(section.summary.gain)} ({formatPct(section.summary.pct)})
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openEdit(item)}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.muted}>
              {(item.symbol || '—') + ' · ' + item.investment_type.replace('_', ' ') + ' · ' + (item.source || 'manual')}
            </Text>
            <Text style={styles.meta}>
              Invested {formatMoney(item.invested_value)} · Value {formatMoney(item.current_value)}
            </Text>
            <Text style={{ color: item.gain_loss >= 0 ? colors.positive : colors.negative, fontWeight: '700' }}>
              P/L {formatMoney(item.gain_loss)} ({formatPct(item.gain_loss_pct)})
            </Text>
            <Text style={styles.meta}>Docs {item.attachment_count || 0} · Tap to edit / attach</Text>
          </Pressable>
        )}
      />

      <EditModal visible={!!editing} title="Edit investment" onClose={() => setEditing(null)} onSave={save}>
        <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="Symbol" value={form.symbol} onChangeText={(v) => setForm({ ...form, symbol: v })} />
        <Field label="Type" value={form.investment_type} onChangeText={(v) => setForm({ ...form, investment_type: v })} />
        <Field label="Quantity" value={form.quantity} onChangeText={(v) => setForm({ ...form, quantity: v })} keyboardType="numeric" />
        <Field label="Buy price" value={form.buy_price} onChangeText={(v) => setForm({ ...form, buy_price: v })} keyboardType="numeric" />
        <Field label="Current price" value={form.current_price} onChangeText={(v) => setForm({ ...form, current_price: v })} keyboardType="numeric" />
        <Field label="Purchase date (YYYY-MM-DD)" value={form.purchase_date} onChangeText={(v) => setForm({ ...form, purchase_date: v })} />
        <Field label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />
        {editing && <AttachmentsPanel entityType="investment" entityId={editing.id} onChanged={load} />}
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
    marginBottom: 8,
  },
  title: { color: colors.ink, fontWeight: '700', fontSize: 17 },
  muted: { color: colors.muted },
  meta: { color: colors.ink, marginTop: 4 },
  stat: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 4 },
  error: { color: colors.negative, marginBottom: 8 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  sectionTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 },
})
