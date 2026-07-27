import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Alert, TextInput } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { api, openAttachment, uploadAttachment } from '../api'
import { colors, formatDate } from '../theme'

export default function AttachmentsPanel({ entityType, entityId, onChanged }) {
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!entityId) return
    setItems(await api(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`))
  }

  useEffect(() => {
    load().catch((err) => Alert.alert('Attachments', err.message))
  }, [entityType, entityId])

  async function pickAndUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !result.assets?.length) return
      const file = result.assets[0]
      setBusy(true)
      await uploadAttachment({
        entityType,
        entityId,
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
        title: title || undefined,
      })
      setTitle('')
      await load()
      onChanged?.()
    } catch (err) {
      Alert.alert('Upload failed', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    try {
      await api(`/api/attachments/${id}`, { method: 'DELETE' })
      await load()
      onChanged?.()
    } catch (err) {
      Alert.alert('Delete failed', err.message)
    }
  }

  if (!entityId) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Documents</Text>
      <TextInput
        style={styles.input}
        placeholder="Optional title"
        placeholderTextColor={colors.muted}
        value={title}
        onChangeText={setTitle}
      />
      <Pressable style={styles.button} onPress={pickAndUpload} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Uploading…' : 'Attach document'}</Text>
      </Pressable>

      {items.length === 0 ? (
        <Text style={styles.muted}>No documents yet.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title || item.original_filename}</Text>
              <Text style={styles.muted}>
                {item.original_filename} · {formatDate(item.created_at)}
              </Text>
            </View>
            <Pressable onPress={() => openAttachment(item).catch((err) => Alert.alert('Open failed', err.message))}>
              <Text style={styles.link}>Open</Text>
            </Pressable>
            <Pressable onPress={() => remove(item.id)}>
              <Text style={styles.danger}>Delete</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 10 },
  heading: { color: colors.ink, fontWeight: '700', fontSize: 17 },
  muted: { color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    backgroundColor: 'rgba(8,16,13,0.45)',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#1a1208', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { color: colors.ink, fontWeight: '600' },
  link: { color: colors.accent, fontWeight: '600' },
  danger: { color: colors.negative, fontWeight: '600' },
})
