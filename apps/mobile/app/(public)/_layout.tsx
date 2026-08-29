import React, { useMemo } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { Slot, useLocalSearchParams } from 'expo-router';
import type { ThemeConfig } from '@order-system/shared';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider';
import { applyBranding, defaultTheme } from '../../src/theme/theme.config';
import { usePublicBranding } from '../../src/hooks/customer/usePublicBranding';
import { Button, Heading, Text } from '../../src/components';

/**
 * Layout for the public (customer) route group `(public)`.
 *
 * Resolves the tenant branding from the `:slug` route param (no authentication),
 * applies the tenant theme via the existing ThemeProvider, and renders the child
 * screens. If the slug does not resolve to a tenant (404), a dedicated
 * "Estabelecimento não encontrado" screen is shown instead.
 *
 * The `(public)` group is whitelisted in the auth gate (see useAuth.tsx), so
 * these routes are reachable without login.
 *
 * All state screens (loading/not-found/error) render INSIDE the ThemeProvider
 * and consume the resolved tenant theme via `useTheme()` — no direct use of
 * `defaultTheme` for styling, so the tenant branding applies consistently.
 */
export default function PublicLayout() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { branding, isLoading, error, refetch } = usePublicBranding(slug);

  // Merge the tenant branding over the neutral platform theme. `PublicBranding`
  // is structurally compatible with the branding shape applyBranding expects
  // (businessName, logoUrl, theme).
  const theme: ThemeConfig = useMemo(() => {
    if (!branding) return defaultTheme;
    return applyBranding({
      businessName: branding.businessName,
      logoUrl: branding.logoUrl,
      theme: (branding.theme ?? {}) as Partial<ThemeConfig>,
    } as Parameters<typeof applyBranding>[0]);
  }, [branding]);

  return (
    <ThemeProvider theme={theme}>
      {isLoading ? (
        <LoadingScreen />
      ) : error?.notFound ? (
        <NotFoundScreen />
      ) : error ? (
        <ErrorScreen message={error.message} onRetry={refetch} />
      ) : (
        <Slot />
      )}
    </ThemeProvider>
  );
}

function centeredContainer(theme: ThemeConfig): ViewStyle {
  return {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  };
}

function LoadingScreen() {
  const theme = useTheme();
  return (
    <View style={[centeredContainer(theme), { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

function NotFoundScreen() {
  const theme = useTheme();
  return (
    <View
      style={[centeredContainer(theme), { backgroundColor: theme.colors.background }]}
      testID="public-not-found"
    >
      <Heading level={2} align="center">
        Estabelecimento não encontrado
      </Heading>
      <View style={{ marginTop: theme.spacing.sm }}>
        <Text align="center" color={theme.colors.textSecondary}>
          Verifique se o link está correto e tente novamente.
        </Text>
      </View>
    </View>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={[centeredContainer(theme), { backgroundColor: theme.colors.background }]}
      testID="public-error"
    >
      <Text align="center" color={theme.colors.error}>
        {message}
      </Text>
      <View style={{ marginTop: theme.spacing.md }}>
        <Button title="Tentar novamente" onPress={onRetry} variant="primary" />
      </View>
    </View>
  );
}
