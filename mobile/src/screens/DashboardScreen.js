import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import { colors, formatDate, formatMoney } from '../theme'

export default function DashboardScreen() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api('/api/dashboard'))
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

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    )
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    )
  }

  const nw = data.net_worth

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
    >
      <View style={[styles.card, styles.hero]}>
        <Text style={styles.muted}>Net worth · {formatDate(nw.as_of)}</Text>
        <Text style={[styles.heroValue, { color: nw.net_worth >= 0 ? colors.positive : colors.negative }]}>
          {formatMoney(nw.net_worth)}
        </Text>
        <Text style={styles.muted}>
          Assets {formatMoney(nw.total_assets)} − Debts {formatMoney(nw.total_liabilities)}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.muted}>Due this month</Text>
          <Text style={styles.stat}>{formatMoney(data.dues_this_month?.total_due || 0)}</Text>
          <Text style={styles.muted}>
            {data.dues_this_month?.label} · {data.dues_this_month?.installment_count || 0} items
          </Text>
        </View>
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.muted}>Due next month</Text>
          <Text style={styles.stat}>{formatMoney(data.dues_next_month?.total_due || 0)}</Text>
          <Text style={styles.muted}>
            {data.dues_next_month?.label} · {data.dues_next_month?.installment_count || 0} items
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Stat label="Investments" value={formatMoney(nw.investments)} />
        <Stat label="Property" value={formatMoney(nw.properties)} />
      </View>
      <View style={styles.row}>
        <Stat label="Other assets" value={formatMoney(nw.other_assets || 0)} />
        <Stat label="Alerts" value={String(data.unread_notifications)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Upcoming payments</Text>
        {(data.upcoming_installments || []).length === 0 ? (
          <Text style={styles.muted}>No SIP / premium / EMI dues through next month.</Text>
        ) : (
          data.upcoming_installments.map((row) => (
            <View key={row.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{row.plan_name}</Text>
                <Text style={styles.muted}>
                  {String(row.plan_kind || '').toUpperCase()}
                  {row.source === 'coin' ? ' · Coin' : ''} · {formatMoney(row.amount)}
                </Text>
              </View>
              <View>
                <Text style={styles.muted}>{formatDate(row.due_date)}</Text>
                <Text style={styles.muted}>{row.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Upcoming renewals</Text>
        {data.upcoming_renewals.length === 0 ? (
          <Text style={styles.muted}>None in the next 30 days.</Text>
        ) : (
          data.upcoming_renewals.map((p) => (
            <View key={p.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{p.name}</Text>
                <Text style={styles.muted}>{p.provider}</Text>
              </View>
              <Text style={styles.muted}>{formatDate(p.renewal_date)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Alerts</Text>
        {(data.recent_notifications || []).length === 0 ? (
          <Text style={styles.muted}>No alerts right now.</Text>
        ) : (
          data.recent_notifications.map((n) => (
            <View key={n.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{n.title}</Text>
                <Text style={styles.muted}>{n.message}</Text>
              </View>
              <Text style={styles.muted}>{n.due_date ? formatDate(n.due_date) : ''}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

function Stat({ label, value }) {
  return (
    <View style={[styles.card, { flex: 1 }]}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.stat}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  hero: { gap: 6 },
  heroValue: { fontSize: 34, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  muted: { color: colors.muted },
  section: { color: colors.ink, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  stat: { color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 6 },
  item: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { color: colors.ink, fontWeight: '600' },
  error: { color: colors.negative },
})
