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
import AttachmentsPanel from '../components/AttachmentsPanel'
import { colors, formatDate, formatMoney } from '../theme'

const ASSET_TYPES = [
  'gold',
  'silver',
  'fixed_deposit',
  'cash',
  'home_payment',
  'ppf',
  'epf',
  'nps',
  'crypto',
  'other',
]

const emptyForm = {
  name: '',
  asset_type: 'gold',
  quantity: '',
  unit: 'grams',
  purity_karat: '24',
  purchase_value: '',
  current_value: '',
  purchase_date: '',
  maturity_date: '',
  interest_rate: '',
  institution: '',
  notes: '',
}

export default function AssetsScreen() {
  const [items, setItems] = useState([])
  const [prices, setPrices] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [assets, metalPrices] = await Promise.all([
        api('/api/assets'),
        api('/api/assets/metals/prices').catch(() => null),
      ])
      setItems(assets)
      setPrices(metalPrices)
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
      name: item.name,
      asset_type: item.asset_type,
      quantity: String(item.quantity ?? ''),
      unit: item.unit || '',
      purity_karat: String(item.purity_karat ?? 24),
      purchase_value: String(item.purchase_value ?? ''),
      current_value: String(item.current_value ?? ''),
      purchase_date: item.purchase_date || '',
      maturity_date: item.maturity_date || '',
      interest_rate: String(item.interest_rate ?? ''),
      institution: item.institution || '',
      notes: item.notes || '',
    })
    setOpen(true)
  }

  async function save() {
    try {
      const body = {
        ...form,
        quantity: Number(form.quantity || 0),
        purity_karat: Number(form.purity_karat || 24),
        purchase_value: Number(form.purchase_value || 0),
        current_value: Number(form.current_value || 0),
        interest_rate: Number(form.interest_rate || 0),
        unit: form.unit || null,
        institution: form.institution || null,
        maturity_date: form.maturity_date || null,
        notes: form.notes || null,
      }
      if (editing) {
        await api(`/api/assets/${editing.id}`, { method: 'PUT', body })
      } else {
        await api('/api/assets', { method: 'POST', body })
        setOpen(false)
      }
      await load()
      if (editing) {
        const refreshed = await api('/api/assets')
        const current = refreshed.find((i) => i.id === editing.id)
        if (current) setEditing(current)
      }
      Alert.alert('Saved', 'Asset saved')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  async function remove(item) {
    Alert.alert('Delete asset', `Remove ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api(`/api/assets/${item.id}`, { method: 'DELETE' })
          await load()
        },
      },
    ])
  }

  async function refreshMetals() {
    setRefreshing(true)
    try {
      const result = await api('/api/assets/metals/refresh', { method: 'POST' })
      setPrices(result.prices)
      await load()
      Alert.alert('Updated', `Revalued ${result.updated} gold/silver holding(s)`)
    } catch (err) {
      Alert.alert('Refresh failed', err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const total = items.reduce((sum, item) => sum + Number(item.current_value || 0), 0)

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {prices ? (
              <View style={styles.card}>
                <Text style={styles.muted}>Live India metals (INR / g)</Text>
                <Text style={styles.meta}>
                  Gold 24K {formatMoney(prices.gold_per_gram_24k)} · 22K {formatMoney(prices.gold_per_gram_22k)}
                </Text>
                <Text style={styles.meta}>Silver {formatMoney(prices.silver_per_gram)}</Text>
                <Text style={styles.muted}>
                  {prices.source} · spot (not jeweller retail)
                </Text>
              </View>
            ) : null}
            <View style={styles.card}>
              <Text style={styles.muted}>Total other assets</Text>
              <Text style={styles.stat}>{formatMoney(total)}</Text>
            </View>
            <Pressable style={styles.primary} onPress={openCreate}>
              <Text style={styles.primaryText}>Add asset</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={refreshMetals} disabled={refreshing}>
              <Text style={styles.ghostText}>{refreshing ? 'Refreshing…' : 'Refresh gold / silver'}</Text>
            </Pressable>
            <Text style={styles.muted}>Gold, silver, FDs, cash, home payments, PPF, and more.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.muted}>No other assets yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openEdit(item)}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.asset_type.replace('_', ' ')}
              {item.quantity ? ` · ${item.quantity} ${item.unit || ''}` : ''}
              {item.asset_type === 'gold' && item.purity_karat ? ` · ${item.purity_karat}K` : ''}
            </Text>
            <Text style={styles.meta}>{formatMoney(item.current_value)}</Text>
            {item.maturity_date ? <Text style={styles.muted}>Matures {formatDate(item.maturity_date)}</Text> : null}
            <Text style={styles.muted}>Tap to edit · Docs {item.attachment_count || 0}</Text>
            <Pressable onPress={() => remove(item)} style={{ marginTop: 8 }}>
              <Text style={styles.danger}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{editing ? 'Edit asset' : 'Add asset'}</Text>
            <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {[
                ['name', 'Name'],
                ['asset_type', `Type (${ASSET_TYPES.join('/')})`],
                ['quantity', 'Quantity'],
                ['unit', 'Unit (grams/kg/tola)'],
                ['purity_karat', 'Purity karat (gold: 24/22/18)'],
                ['purchase_value', 'Purchase / cost value'],
                ['current_value', 'Current value'],
                ['purchase_date', 'Purchase date YYYY-MM-DD'],
                ['maturity_date', 'Maturity date (optional)'],
                ['interest_rate', 'Interest rate %'],
                ['institution', 'Institution / bank'],
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
              {editing && <AttachmentsPanel entityType="asset" entityId={editing.id} onChanged={load} />}
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
