import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

export default function RootLayout() {
  const [loaded] = useFonts({
    ...Ionicons.font,
  });

  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: '#050505' }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#050505' },
          animation: 'fade',
        }}
      />
    </SafeAreaProvider>
  );
}
