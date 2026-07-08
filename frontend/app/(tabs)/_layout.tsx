import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';

function TabBarBg() {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />;
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]} />;
}

function ScanTabIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View
      testID="scan-tab-icon"
      style={[
        styles.iconWrap,
        focused && {
          shadowColor: theme.colors.primary,
          shadowOpacity: 0.8,
          shadowRadius: 10,
        },
      ]}>
      <Ionicons name="scan" size={24} color={color} />
    </View>
  );
}

function HistoryTabIcon({ color }: { color: string }) {
  return <Ionicons name="time-outline" size={22} color={color} />;
}

function FavTabIcon({ color }: { color: string }) {
  return <Ionicons name="star-outline" size={22} color={color} />;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Keep the bar clear of the Android nav bar / iOS home indicator.
  const bottomPad = Math.max(insets.bottom, 10);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 58 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 8,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(0,0,0,0.92)',
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          elevation: 0,
        },
        tabBarBackground: TabBarBg,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarLabelStyle: {
          fontSize: 10,
          letterSpacing: 2,
          fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'SCAN', tabBarIcon: ScanTabIcon }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'HISTORY', tabBarIcon: HistoryTabIcon }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: 'SAVED', tabBarIcon: FavTabIcon }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
