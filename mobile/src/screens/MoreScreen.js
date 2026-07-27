import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import AttachmentsPanel from '../components/AttachmentsPanel'
import EditModal, { Field } from '../components/EditModal'
import { colors, formatMoney } from '../theme'

export default function MoreScreen() {
  const { user, logout } = useAuth()
  const [properties, setProperties] = useState([])
  const [liabilities, setLiabilities] = useState([])
  const [editingProperty, setEditingProperty] = useState(null)
  const [editingLiability, setEditingLiability] = useState(null)
  const [propertyForm, setPropertyForm] = useState({})
  const [liabilityForm, setLiabilityForm] = useState({})

  const load = useCallback(async () => {
    setProperties(await api('/api/properties'))
    setLiabilities(await api('/api/liabilities'))
  }, [])

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {})
    }, [load]),
  )

  function openProperty(item) {
    setEditingProperty(item)
    setPropertyForm({
      name: item.name,
      property_type: item.property_type,
      address: item.address,
      purchase_price: String(item.purchase_price ?? ''),
      current_value: String(item.current_value ?? ''),
      purchase_date: item.purchase_date,
      notes: item.notes || '',
    })
  }

  function openLiability(item) {
    setEditingLiability(item)
    setLiabilityForm({
      name: item.name,
      liability_type: item.liability_type,
      outstanding_amount: String(item.outstanding_amount ?? ''),
      interest_rate: String(item.interest_rate ?? ''),
      due_date: item.due_date || '',
      notes: item.notes || '',
    })
  }

  async function saveProperty() {
    try {
      await api(`/api/properties/${editingProperty.id}`, {
        method: 'PUT',
        body: {
          ...propertyForm,
          purchase_price: Number(propertyForm.purchase_price || 0),
          current_value: Number(propertyForm.current_value || 0),
        },
      })
      await load()
      const refreshed = await api('/api/properties')
      const current = refreshed.find((i) => i.id === editingProperty.id)
      if (current) setEditingProperty(current)
      Alert.alert('Saved', 'Property updated')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  async function saveLiability() {
    try {
      await api(`/api/liabilities/${editingLiability.id}`, {
        method: 'PUT',
        body: {
          ...liabilityForm,
          outstanding_amount: Number(liabilityForm.outstanding_amount || 0),
          interest_rate: Number(liabilityForm.interest_rate || 0),
          due_date: liabilityForm.due_date || null,
        },
      })
      await load()
      const refreshed = await api('/api/liabilities')
      const current = refreshed.find((i) => i.id === editingLiability.id)
      if (current) setEditingLiability(current)
      Alert.alert('Saved', 'Liability updated')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    }
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{user?.full_name}</Text>
          <Text style={styles.muted}>{user?.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Property</Text>
          {properties.length === 0 ? (
            <Text style={styles.muted}>No properties.</Text>
          ) : (
            properties.map((p) => (
              <Pressable key={p.id} style={styles.item} onPress={() => openProperty(p)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{p.name}</Text>
                  <Text style={styles.muted}>Docs {p.attachment_count || 0} · Tap to edit</Text>
                </View>
                <Text style={styles.muted}>{formatMoney(p.current_value)}</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Liabilities</Text>
          {liabilities.length === 0 ? (
            <Text style={styles.muted}>No liabilities.</Text>
          ) : (
            liabilities.map((l) => (
              <Pressable key={l.id} style={styles.item} onPress={() => openLiability(l)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{l.name}</Text>
                  <Text style={styles.muted}>Docs {l.attachment_count || 0} · Tap to edit</Text>
                </View>
                <Text style={{ color: colors.negative }}>{formatMoney(l.outstanding_amount)}</Text>
              </Pressable>
            ))
          )}
        </View>

        <Pressable style={styles.logout} onPress={logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <EditModal
        visible={!!editingProperty}
        title="Edit property"
        onClose={() => setEditingProperty(null)}
        onSave={saveProperty}
      >
        <Field label="Name" value={propertyForm.name} onChangeText={(v) => setPropertyForm({ ...propertyForm, name: v })} />
        <Field label="Type" value={propertyForm.property_type} onChangeText={(v) => setPropertyForm({ ...propertyForm, property_type: v })} />
        <Field label="Address" value={propertyForm.address} onChangeText={(v) => setPropertyForm({ ...propertyForm, address: v })} />
        <Field label="Purchase price" value={propertyForm.purchase_price} onChangeText={(v) => setPropertyForm({ ...propertyForm, purchase_price: v })} keyboardType="numeric" />
        <Field label="Current value" value={propertyForm.current_value} onChangeText={(v) => setPropertyForm({ ...propertyForm, current_value: v })} keyboardType="numeric" />
        <Field label="Purchase date" value={propertyForm.purchase_date} onChangeText={(v) => setPropertyForm({ ...propertyForm, purchase_date: v })} />
        <Field label="Notes" value={propertyForm.notes} onChangeText={(v) => setPropertyForm({ ...propertyForm, notes: v })} />
        {editingProperty && (
          <AttachmentsPanel entityType="property" entityId={editingProperty.id} onChanged={load} />
        )}
      </EditModal>

      <EditModal
        visible={!!editingLiability}
        title="Edit liability"
        onClose={() => setEditingLiability(null)}
        onSave={saveLiability}
      >
        <Field label="Name" value={liabilityForm.name} onChangeText={(v) => setLiabilityForm({ ...liabilityForm, name: v })} />
        <Field label="Type" value={liabilityForm.liability_type} onChangeText={(v) => setLiabilityForm({ ...liabilityForm, liability_type: v })} />
        <Field label="Outstanding" value={liabilityForm.outstanding_amount} onChangeText={(v) => setLiabilityForm({ ...liabilityForm, outstanding_amount: v })} keyboardType="numeric" />
        <Field label="Interest rate %" value={liabilityForm.interest_rate} onChangeText={(v) => setLiabilityForm({ ...liabilityForm, interest_rate: v })} keyboardType="numeric" />
        <Field label="Due date" value={liabilityForm.due_date} onChangeText={(v) => setLiabilityForm({ ...liabilityForm, due_date: v })} />
        <Field label="Notes" value={liabilityForm.notes} onChangeText={(v) => setLiabilityForm({ ...liabilityForm, notes: v })} />
        {editingLiability && (
          <AttachmentsPanel entityType="liability" entityId={editingLiability.id} onChanged={load} />
        )}
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
  },
  title: { color: colors.ink, fontWeight: '700', fontSize: 18 },
  muted: { color: colors.muted },
  section: { color: colors.ink, fontWeight: '700', fontSize: 17, marginBottom: 8 },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  itemTitle: { color: colors.ink, fontWeight: '600' },
  logout: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    alignItems: 'center',
  },
  logoutText: { color: colors.ink, fontWeight: '600' },
})
