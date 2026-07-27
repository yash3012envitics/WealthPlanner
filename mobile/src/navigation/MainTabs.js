import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import DashboardScreen from '../screens/DashboardScreen'
import InsuranceScreen from '../screens/InsuranceScreen'
import InvestmentsScreen from '../screens/InvestmentsScreen'
import RecurringScreen from '../screens/RecurringScreen'
import AssetsScreen from '../screens/AssetsScreen'
import AlertsScreen from '../screens/AlertsScreen'
import MoreScreen from '../screens/MoreScreen'
import PlanStack from './PlanStack'
import { colors } from '../theme'

const Tab = createBottomTabNavigator()

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        tabBarStyle: {
          backgroundColor: '#12241e',
          borderTopColor: colors.line,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen name="NetWorth" component={DashboardScreen} options={{ title: 'Net Worth' }} />
      <Tab.Screen name="Insurance" component={InsuranceScreen} />
      <Tab.Screen name="Invest" component={InvestmentsScreen} options={{ title: 'Invest' }} />
      <Tab.Screen name="Assets" component={AssetsScreen} />
      <Tab.Screen name="Plan" component={PlanStack} options={{ headerShown: false, title: 'Plan' }} />
      <Tab.Screen name="Recurring" component={RecurringScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  )
}
