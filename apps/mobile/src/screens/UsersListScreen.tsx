import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, Header } from '../components/Layout';
import { ErrorState } from '../components/ErrorState';
import { FilterChips, type FilterChipOption } from '../components/FilterChips';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { withOpacity } from '../utils/color';
import { apiClient } from '../services/api-client';
import type { User, UserRole } from '../types/user';

// ─── Role labels (no colors — stays at module level) ────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  atendente: 'Atendente',
  preparador: 'Preparador',
};

const ROLE_ICONS: Record<UserRole, string> = {
  admin: 'admin_panel_settings',
  atendente: 'headset_mic',
  preparador: 'restaurant',
};

/**
 * Gestão de Usuários — Users List Screen
 *
 * Pixel-perfect match to Penpot "Gestão de Usuários" design.
 * Layout:
 *   AppBar (arrow_back + "Usuários")
 *   Content (padding 16, gap 12):
 *     Filter Row (Admin, Atendente, Preparador chips)
 *     User Cards (badge above name, edit btn + switch on right)
 *     "Novo Usuário" button (inline, bottom)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.4, 6.5
 */
export function UsersListScreen() {
  const theme = useTheme();
  const router = useRouter();

  // ─── Color constants (theme-based) ──────────────────────────────────────────

  const FILTER_OPTIONS: FilterChipOption[] = [
    { key: 'admin', label: 'Admin', color: theme.colors.primary, icon: 'admin_panel_settings' },
    { key: 'atendente', label: 'Atendente', color: theme.colors.preparando, icon: 'headset_mic' },
    { key: 'preparador', label: 'Preparador', color: theme.colors.success, icon: 'restaurant' },
  ];

  const ROLE_BADGE_COLORS: Record<UserRole, string> = {
    admin: theme.colors.primary,
    atendente: theme.colors.preparando,
    preparador: theme.colors.success,
  };

  const ROLE_BADGE_BG_COLORS: Record<UserRole, string> = {
    admin: withOpacity(theme.colors.primary, 0.12),
    atendente: withOpacity(theme.colors.preparando, 0.12),
    preparador: withOpacity(theme.colors.success, 0.12),
  };

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string[]>(['admin', 'atendente', 'preparador']);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async (filters?: string[]) => {
    try {
      setLoading(true);
      setError(null);

      const activeFilters = filters ?? selectedFilter;

      // If all roles selected or none, load all users
      if (activeFilters.length === 3 || activeFilters.length === 0) {
        const response = await apiClient.listUsers();
        setUsers(response.users);
      } else if (activeFilters.length === 1) {
        // Single role filter
        const response = await apiClient.listUsers({ role: activeFilters[0] as UserRole });
        setUsers(response.users);
      } else {
        // Multiple roles: fetch all and filter client-side
        const response = await apiClient.listUsers();
        setUsers(response.users.filter(u => activeFilters.includes(u.role)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [selectedFilter]);

  // Refetch users when screen regains focus (e.g., after editing a user)
  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers])
  );

  const handleFilterChange = useCallback((selected: string[]) => {
    setSelectedFilter(selected);
    loadUsers(selected);
  }, [loadUsers]);

  const handleToggleStatus = useCallback(async (user: User) => {
    const newStatus = user.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      setTogglingUserId(user.id);
      await apiClient.toggleUserStatus(user.id, newStatus);
      // Update local state
      setUsers(prev =>
        prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u)
      );
    } catch {
      // Silently fail — user can retry
    } finally {
      setTogglingUserId(null);
    }
  }, []);

  // ─── Styles (Penpot pixel-perfect) ────────────────────────────────────────

  // Content area: flex column, gap 12, padding 16
  const contentStyle: ViewStyle = {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  };

  // User card: white bg, borderRadius 12, border 1px #E8DDD5, height 90
  // flex row, alignItems center, justifyContent space-between, paddingHorizontal 16
  const userCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  };

  // Info section: flex column, gap 2, flex 1
  const userInfoStyle: ViewStyle = {
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  };

  // Role badge: height 18, borderRadius 9, icon + label
  const roleBadgeBaseStyle: ViewStyle = {
    borderRadius: 9,
    paddingHorizontal: 6,
    paddingRight: 8,
    height: 18,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  };

  // User name: Inter 14px weight 500, #3D2020
  const userNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginTop: 5,
  };

  // User email: Inter 12px weight 400, #8B6B5A
  const userEmailStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  // Meta section: flex column, gap 4, alignItems end
  const userMetaStyle: ViewStyle = {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  };

  // "Novo Usuário" button: full width, height 44, borderRadius 22, white bg, border 1px #E8DDD5
  const novoUsuarioBtnStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 22,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };

  const novoUsuarioPlusStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const novoUsuarioTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  // Loading/Error/Empty state styles
  const centeredContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderUserCard = ({ item }: { item: User }) => {
    const isActive = item.status === 'ativo';
    const isToggling = togglingUserId === item.id;

    return (
      <Pressable
        style={userCardStyle}
        onPress={() =>
          router.push({
            pathname: '/user-detail',
            params: { id: item.id },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.email}, ${ROLE_LABELS[item.role]}, ${isActive ? 'Ativo' : 'Inativo'}`}
        testID={`user-card-${item.id}`}
      >
        {/* Info: badge + name + email */}
        <View style={userInfoStyle}>
          <View
            style={[
              roleBadgeBaseStyle,
              { backgroundColor: ROLE_BADGE_BG_COLORS[item.role] },
            ]}
          >
            <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 11, fontWeight: '400', color: ROLE_BADGE_COLORS[item.role] }}>
              {ROLE_ICONS[item.role]}
            </RNText>
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 9, fontWeight: '400', color: ROLE_BADGE_COLORS[item.role] }}>
              {ROLE_LABELS[item.role]}
            </RNText>
          </View>
          <RNText style={userNameStyle}>{item.name}</RNText>
          <RNText style={userEmailStyle}>{item.email}</RNText>
        </View>

        {/* Meta: Switch toggle only */}
        <View style={userMetaStyle}>
          <ToggleSwitch
            value={isActive}
            onValueChange={() => handleToggleStatus(item)}
            disabled={isToggling}
            accessibilityLabel={`${item.name} está ${isActive ? 'ativo' : 'inativo'}`}
            testID={`toggle-user-${item.id}`}
          />
        </View>
      </Pressable>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (loading) {
      return (
        <View style={centeredContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: theme.colors.textSecondary,
              marginTop: 8,
            }}
          >
            Carregando usuários...
          </RNText>
        </View>
      );
    }

    if (error) {
      return (
        <ErrorState message={error} onRetry={() => loadUsers()} />
      );
    }

    if (users.length === 0) {
      return (
        <View style={centeredContainerStyle}>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: theme.colors.textSecondary,
              textAlign: 'center',
            }}
          >
            Nenhum usuário encontrado.
          </RNText>
        </View>
      );
    }

    return (
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUserCard}
        contentContainerStyle={{ gap: 12 }}
        showsVerticalScrollIndicator
        ListFooterComponent={
          <Pressable
            style={[novoUsuarioBtnStyle, { marginTop: 12 }]}
            onPress={() => router.push('/user-form')}
            accessibilityRole="button"
            accessibilityLabel="Adicionar"
            accessibilityHint="Navega para a tela de criação de usuário"
            testID="new-user-button"
          >
            <RNText style={novoUsuarioPlusStyle}>+</RNText>
            <RNText style={novoUsuarioTextStyle}>Adicionar</RNText>
          </Pressable>
        }
      />
    );
  };

  return (
    <Screen padding={false}>
      {/* Header */}
      <Header title="Usuários" onBack={() => router.back()} />

      {/* Content */}
      <View style={contentStyle}>
        {/* Filter row: role chips */}
        <FilterChips
          options={FILTER_OPTIONS}
          selected={selectedFilter}
          onSelectionChange={handleFilterChange}
          testID="user-filter"
        />

        {/* User list / states */}
        {renderContent()}
      </View>

      {/* Bottom Navigation */}
      <BottomNav />
    </Screen>
  );
}
