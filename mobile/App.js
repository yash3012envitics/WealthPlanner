import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import AuthStack from './src/navigation/AuthStack'
import MainTabs from './src/navigation/MainTabs'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { colors } from './src/theme'

function Root() {
  const { token, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.bootText}>Loading WealthPlanner…</Text>
      </View>
    )
  }

  return token ? <MainTabs /> : <AuthStack />
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer
          theme={{
            ...DarkTheme,
            colors: {
              ...DarkTheme.colors,
              background: colors.bg,
              card: colors.panel,
              text: colors.ink,
              border: colors.line,
              primary: colors.accent,
            },
          }}
        >
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 12,
  },
  bootText: { color: colors.muted },
})
