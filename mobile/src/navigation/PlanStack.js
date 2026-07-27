import { createNativeStackNavigator } from '@react-navigation/native-stack'
import PlanScreen from '../screens/PlanScreen'
import CashflowScreen from '../screens/CashflowScreen'
import TargetScreen from '../screens/TargetScreen'
import { colors } from '../theme'

const Stack = createNativeStackNavigator()

export default function PlanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="PlanHome" component={PlanScreen} options={{ title: 'Plan' }} />
      <Stack.Screen name="Cashflow" component={CashflowScreen} options={{ title: 'Cashflow' }} />
      <Stack.Screen name="Target" component={TargetScreen} options={{ title: 'Target' }} />
    </Stack.Navigator>
  )
}
