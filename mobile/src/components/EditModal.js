import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native'
import { colors } from '../theme'

export default function EditModal({ visible, title, onClose, onSave, children, saveLabel = 'Save changes' }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>{children}</ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={onSave}>
              <Text style={styles.primaryText}>{saveLabel}</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function Field({ label, value, onChangeText, ...props }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.muted}
        value={value == null ? '' : String(value)}
        onChangeText={onChangeText}
        {...props}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#152821',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  label: { color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    backgroundColor: 'rgba(8,16,13,0.45)',
  },
  actions: { gap: 10, marginTop: 8 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#1a1208', fontWeight: '700' },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink, fontWeight: '600' },
})
