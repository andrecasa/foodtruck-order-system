import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { AuthProvider } from '../src/hooks/useAuth';

/**
 * Root layout — loads custom fonts (Inter) and injects Material Symbols
 * via Google Fonts stylesheet on web.
 *
 * Font loading strategy:
 * - Inter: loaded via @expo-google-fonts/inter (all platforms)
 * - Material Symbols Outlined: Google Fonts stylesheet (web only for now)
 *   On native, will need a proper TTF or @expo/vector-icons fallback.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Inter': Inter_400Regular,
    'Inter-Light': Inter_300Light,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  // Inject Google Fonts stylesheet on web for Inter + Material Symbols Outlined
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const doc = (globalThis as Record<string, unknown>).document as {
        createElement: (tag: string) => { href: string; rel: string };
        head: { appendChild: (el: unknown) => void };
        querySelector: (sel: string) => unknown;
      } | undefined;
      if (doc && !doc.querySelector('link[href*="Material+Symbols+Outlined"]')) {
        const link = doc.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Inter:wght@300;400;500;600&display=swap';
        link.rel = 'stylesheet';
        doc.head.appendChild(link);
      }
    }
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="create-menu-item"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="edit-menu-item"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="users-list"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="user-form"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="user-detail"
            options={{
              presentation: 'card',
              headerShown: false,
            }}
          />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
