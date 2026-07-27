import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { api } from '../api'
import { colors, formatDate, formatMoney } from '../theme'

export default function PlanScreen() {
  const navigation = useNavigation()
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setPlan(await api('/api/plan'))
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

  const delta = plan?.suggested_invest_delta ?? 0
  const deltaLabel =
    delta > 0
      ? `Add ${formatMoney(Math.abs(delta))} / mo beyond SIPs`
      : delta === 0
        ? 'No extra invest beyond current SIPs'
        : `Can invest ${formatMoney(Math.abs(delta))} less / mo`

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={plan?.months || []}
      keyExtractor={(row) => `${row.year}-${row.month}`}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable style={styles.ghost} onPress={() => navigation.navigate('Cashflow')}>
              <Text style={styles.ghostText}>Cashflow</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => navigation.navigate('Target')}>
              <Text style={styles.ghostText}>Target</Text>
            </Pressable>
          </View>
          {plan ? (
            <>
              <View style={styles.card}>
                <Text style={styles.muted}>Summary</Text>
                <Text style={styles.body}>{plan.summary}</Text>
                {(plan.warnings || []).map((w) => (
                  <Text key={w} style={styles.muted}>
                    • {w}
                  </Text>
                ))}
              </View>
              <View style={styles.card}>
                <Text style={styles.muted}>Spend / mo (exp + other + SIP)</Text>
                <Text style={styles.stat}>{formatMoney(plan.suggested_monthly_spend)}</Text>
                <Text style={styles.muted}>
                  Exp {formatMoney(plan.monthly_expenses)} + Other{' '}
                  {formatMoney(plan.monthly_other_invest ?? plan.monthly_premiums)} + SIP{' '}
                  {formatMoney(plan.monthly_sip)}
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.muted}>Suggested invest / mo</Text>
                <Text style={styles.stat}>{formatMoney(plan.suggested_monthly_invest)}</Text>
                <Text style={styles.muted}>{deltaLabel}</Text>
                <Text style={styles.muted}>
                  Required total {formatMoney(plan.required_monthly_invest)} / mo ·{' '}
                  {(((plan.expected_annual_return ?? 0.12) * 100).toFixed(1))}% return
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.muted}>
                  NW {formatMoney(plan.current_net_worth)}
                  {plan.target_amount != null
                    ? ` → ${formatMoney(plan.target_amount)} by ${formatDate(plan.target_date)}`
                    : ''}
                </Text>
                <Text style={styles.muted}>
                  Income {formatMoney(plan.monthly_income)} · Expenses {formatMoney(plan.monthly_expenses)} · SIP{' '}
                  {formatMoney(plan.monthly_sip)}
                </Text>
                {plan.projected_net_worth_at_target ? (
                  <Text style={styles.muted}>
                    Projected at target {formatMoney(plan.projected_net_worth_at_target)}
                  </Text>
                ) : null}
              </View>
              {(plan.sip_lines || []).length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.muted}>Active SIPs (monthly invested)</Text>
                  {plan.sip_lines.map((line) => (
                    <Text key={`${line.name}-${line.monthly_amount}`} style={styles.body}>
                      {line.name}: {formatMoney(line.monthly_amount)}/mo
                      {line.source === 'coin' ? ' · Coin' : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.section}>Month-by-month</Text>
            </>
          ) : (
            <Text style={styles.muted}>Loading plan…</Text>
          )}
        </View>
      }
      ListEmptyComponent={plan ? <Text style={styles.muted}>Set a future target date to see the schedule.</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.label}</Text>
          <Text style={styles.muted}>
            Other invest {formatMoney(item.other_invest ?? plan?.monthly_other_invest ?? plan?.monthly_premiums ?? 0)} ·
            SIP {formatMoney(item.monthly_invested ?? plan?.monthly_sip ?? 0)} · Spend{' '}
            {formatMoney(item.suggested_spend)} · Suggested invest {formatMoney(item.suggested_invest)}
          </Text>
          {(item.invest_options || []).length > 0 && item.suggested_invest > 0 ? (
            <View style={{ marginTop: 4, gap: 2 }}>
              <Text style={styles.muted}>Suggested options</Text>
              {item.invest_options.map((opt) => (
                <Text key={opt.label} style={styles.body}>
                  {formatMoney(opt.amount)} · {opt.percent}% {opt.label} (~
                  {((opt.expected_return || 0) * 100).toFixed(1)}%)
                </Text>
              ))}
              {plan?.invest_options_note ? (
                <Text style={[styles.muted, { marginTop: 4, fontSize: 12 }]}>{plan.invest_options_note}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.muted}>
            Current SIP {formatMoney(item.monthly_invested ?? plan?.monthly_sip ?? 0)} · Income{' '}
            {formatMoney(item.income)} · Expenses {formatMoney(item.expenses)}
            {item.income_source !== 'defaults' || item.expense_source !== 'defaults' ? ' · month overrides' : ''}
          </Text>
          <Text style={styles.meta}>Projected NW {formatMoney(item.projected_net_worth)}</Text>
          <Text style={styles.muted}>
            Inv in SIP {formatMoney(item.monthly_invested ?? plan?.monthly_sip ?? 0)}
          </Text>
        </View>
      )}
    />
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
  section: { color: colors.ink, fontWeight: '700', fontSize: 16, marginTop: 4 },
  muted: { color: colors.muted },
  body: { color: colors.ink, lineHeight: 20, marginTop: 4 },
  meta: { color: colors.ink, marginTop: 4, fontWeight: '600' },
  stat: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 4 },
  error: { color: colors.negative },
  row: { flexDirection: 'row', gap: 8 },
  ghost: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink, fontWeight: '600' },
})
