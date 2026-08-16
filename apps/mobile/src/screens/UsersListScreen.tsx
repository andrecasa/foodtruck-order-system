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
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { Screen } from '../components/Layout';
import { FilterChips, type FilterChipOption } from '../components/FilterChips';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { listUsers, toggleUserStatus } from '../services/userService';
import type { User, UserRole } from '../types/user';

// ─── Filter chip options (role-based, no "todos") ───────────────────────────
// Penpot: Admin (#7B2D2D), Atendente (#5B8BA8), Preparador (#5A8C5A)

const FILTER_OPTIONS: FilterChipOption[] = [
  { key: 'admin', label: 'Admin', color: '#7B2D2D' },
  { key: 'atendente', label: 'Atendente', color: '#5B8BA8' },
  { key: 'preparador', label: 'Preparador', color: '#5A8C5A' },
];

// ─── Role badge colors (solid background, white text) ───────────────────────
// Penpot: admin=#7B2D2D, atendente=#5B8BA8 (steel blue), preparador=#5A8C5A (sage green)

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin: '#7B2D2D',
  atendente: '#5B8BA8',
  preparador: '#5A8C5A',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  atendente: 'Atendente',
  preparador: 'Preparador',
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
  const navigation = useNavigation();

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
        const response = await listUsers();
        setUsers(response.users);
      } else if (activeFilters.length === 1) {
        // Single role filter
        const response = await listUsers({ role: activeFilters[0] as UserRole });
        setUsers(response.users);
      } else {
        // Multiple roles: fetch all and filter client-side
        const response = await listUsers();
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
      await toggleUserStatus(user.id, newStatus);
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

  // AppBar: height 56, bg white, flex row, paddingHorizontal 16, gap 12, alignItems center
  const appBarStyle: ViewStyle = {
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
  };

  const backIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#8B6B5A',
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '400',
    color: '#3D2020',
  };

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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD5',
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

  // Role badge: height 15, borderRadius 10, paddingHorizontal 8, solid color bg, white text
  const roleBadgeBaseStyle: ViewStyle = {
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 15,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  };

  // User name: Inter 14px weight 500, #3D2020
  const userNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: '#3D2020',
    marginTop: 5,
  };

  // User email: Inter 12px weight 400, #8B6B5A
  const userEmailStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: '#8B6B5A',
  };

  // Meta section: flex column, gap 4, alignItems end
  const userMetaStyle: ViewStyle = {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  };

  // Edit button: 24x24, borderRadius 12, bg primary@8%, border 1px primary@30%
  // (removed — no longer in design)

  // "Novo Usuário" button: full width, height 44, borderRadius 22, white bg, border 1px #E8DDD5
  const novoUsuarioBtnStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD5',
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
    color: '#3D2020',
  };

  const novoUsuarioTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: '#3D2020',
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
      <View
        style={userCardStyle}
        accessibilityLabel={`${item.name}, ${item.email}, ${ROLE_LABELS[item.role]}, ${isActive ? 'Ativo' : 'Inativo'}`}
        testID={`user-card-${item.id}`}
      >
        {/* Info: badge + name + email (tappable to navigate) */}
        <Pressable
          style={userInfoStyle}
          onPress={() =>
            router.push({
              pathname: '/user-detail',
              params: { id: item.id },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Editar ${item.name}`}
        >
          <View
            style={[
              roleBadgeBaseStyle,
              { backgroundColor: ROLE_BADGE_COLORS[item.role] },
            ]}
          >
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 8, fontWeight: '400', color: '#FFFFFF' }}>
              {ROLE_LABELS[item.role]}
            </RNText>
          </View>
          <RNText style={userNameStyle}>{item.name}</RNText>
          <RNText style={userEmailStyle}>{item.email}</RNText>
        </Pressable>

        {/* Meta: Switch toggle */}
        <View style={userMetaStyle}>
          <ToggleSwitch
            value={isActive}
            onValueChange={() => handleToggleStatus(item)}
            disabled={isToggling}
            accessibilityLabel={`${item.name} está ${isActive ? 'ativo' : 'inativo'}`}
            testID={`toggle-user-${item.id}`}
          />
        </View>
      </View>
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
              color: '#8B6B5A',
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
        <View style={centeredContainerStyle}>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: theme.colors.error,
              textAlign: 'center',
            }}
          >
            {error}
          </RNText>
          <View style={{ marginTop: 16 }}>
            <Button title="Tentar novamente" onPress={() => loadUsers()} variant="primary" />
          </View>
        </View>
      );
    }

    if (users.length === 0) {
      return (
        <View style={centeredContainerStyle}>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: '#8B6B5A',
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
            accessibilityLabel="Novo Usuário"
            accessibilityHint="Navega para a tela de criação de usuário"
            testID="new-user-button"
          >
            <RNText style={novoUsuarioPlusStyle}>+</RNText>
            <RNText style={novoUsuarioTextStyle}>Novo Usuário</RNText>
          </Pressable>
        }
      />
    );
  };

  return (
    <Screen padding={false} hasHeader={false}>
      {/* AppBar: arrow_back + "Usuários" */}
      <View style={appBarStyle} accessibilityRole="header">
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          testID="back-button"
        >
          <RNText style={backIconStyle}>arrow_back</RNText>
        </Pressable>
        <RNText style={titleStyle}>Usuários</RNText>
      </View>

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
