import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '../api'
import { colors, formatDate } from '../theme'

export default function AlertsScreen() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      await api('/api/notifications/refresh', { method: 'POST' })
      setItems(await api('/api/notifications'))
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

  async function markRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' })
    await load()
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={items}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={<Text style={styles.muted}>No alerts right now.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.card, { opacity: item.is_read ? 0.7 : 1 }]}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.muted}>{item.message}</Text>
          <Text style={styles.meta}>Due {formatDate(item.due_date)}</Text>
          {!item.is_read && (
            <Pressable style={styles.button} onPress={() => markRead(item.id)}>
              <Text style={styles.buttonText}>Mark read</Text>
            </Pressable>
          )}
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
    gap: 6,
  },
  title: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted, lineHeight: 20 },
  meta: { color: colors.accent, marginTop: 4 },
  button: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: { color: '#1a1208', fontWeight: '700' },
  error: { color: colors.negative, marginBottom: 8 },
})
