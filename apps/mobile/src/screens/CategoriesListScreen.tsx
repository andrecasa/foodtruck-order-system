import React, { useCallback, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ToggleSwitch } from '../components/ToggleSwitch';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import type { Category } from '@order-system/shared';

/**
 * Categorias — Categories List Screen
 *
 * Reorder via arrow buttons (↑/↓). Tap on category info to navigate to edit.
 */
export function CategoriesListScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Keep a ref to restore order on reorder failure
  const previousOrderRef = useRef<Category[]>([]);

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getCategories();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch categories when screen regains focus
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  // ─── Toggle status ──────────────────────────────────────────────────────────

  const handleToggleStatus = useCallback(async (category: Category) => {
    const action = category.status === 'ativo' ? 'deactivate' : 'activate';
    try {
      setTogglingId(category.id);
      const updated = await apiClient.toggleCategoryStatus(category.id, action);
      setCategories(prev =>
        prev.map(c => c.id === category.id ? { ...c, status: updated.status } : c)
      );
    } catch (err) {
      Alert.alert(
        'Erro',
        err instanceof Error ? err.message : 'Erro ao alterar status da categoria'
      );
    } finally {
      setTogglingId(null);
    }
  }, []);

  // ─── Reorder ────────────────────────────────────────────────────────────────

  const handleMoveUp = useCallback(async (index: number) => {
    if (index === 0 || reordering) return;

    previousOrderRef.current = [...categories];
    const newList = [...categories];
    const temp = newList[index - 1]!;
    newList[index - 1] = newList[index]!;
    newList[index] = temp;
    setCategories(newList);

    try {
      setReordering(true);
      await apiClient.reorderCategories({ categoryIds: newList.map(c => c.id) });
    } catch (err) {
      setCategories(previousOrderRef.current);
      Alert.alert(
        'Erro',
        err instanceof Error ? err.message : 'Erro ao reordenar categorias'
      );
    } finally {
      setReordering(false);
    }
  }, [categories, reordering]);

  const handleMoveDown = useCallback(async (index: number) => {
    if (index === categories.length - 1 || reordering) return;

    previousOrderRef.current = [...categories];
    const newList = [...categories];
    const temp = newList[index]!;
    newList[index] = newList[index + 1]!;
    newList[index + 1] = temp;
    setCategories(newList);

    try {
      setReordering(true);
      await apiClient.reorderCategories({ categoryIds: newList.map(c => c.id) });
    } catch (err) {
      setCategories(previousOrderRef.current);
      Alert.alert(
        'Erro',
        err instanceof Error ? err.message : 'Erro ao reordenar categorias'
      );
    } finally {
      setReordering(false);
    }
  }, [categories, reordering]);

  // ─── Styles (Penpot pixel-perfect) ────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  };

  const categoryCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  };

  const reorderButtonStyle: ViewStyle = {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  };

  const reorderIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: theme.colors.textSecondary,
  };

  const categoryInfoStyle: ViewStyle = {
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  };

  const categoryNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  };

  const itemCountBadgeStyle: ViewStyle = {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  };

  const itemCountTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  const actionsStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  };

  const novaCategoriaButtonStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    borderRadius: 22,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };

  const novaCategoriaTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const centeredContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderCategoryCard = ({ item, index }: { item: Category; index: number }) => {
    const isActive = item.status === 'ativo';
    const isToggling = togglingId === item.id;

    return (
      <View
        style={categoryCardStyle}
        accessibilityLabel={`${item.name}, ${item.itemCount} itens, ${isActive ? 'Ativa' : 'Inativa'}`}
        testID={`category-card-${item.id}`}
      >
        {/* Reorder arrows */}
        <View style={{ flexDirection: 'column', gap: 4, marginRight: 12 }}>
          <Pressable
            style={[reorderButtonStyle, index === 0 && { opacity: 0.3 }]}
            onPress={() => handleMoveUp(index)}
            disabled={index === 0 || reordering}
            accessibilityRole="button"
            accessibilityLabel={`Mover ${item.name} para cima`}
            testID={`move-up-${item.id}`}
          >
            <RNText style={reorderIconStyle}>keyboard_arrow_up</RNText>
          </Pressable>
          <Pressable
            style={[reorderButtonStyle, index === categories.length - 1 && { opacity: 0.3 }]}
            onPress={() => handleMoveDown(index)}
            disabled={index === categories.length - 1 || reordering}
            accessibilityRole="button"
            accessibilityLabel={`Mover ${item.name} para baixo`}
            testID={`move-down-${item.id}`}
          >
            <RNText style={reorderIconStyle}>keyboard_arrow_down</RNText>
          </Pressable>
        </View>

        {/* Info: name + item count — tap to navigate to edit */}
        <Pressable
          style={categoryInfoStyle}
          onPress={() =>
            router.push({
              pathname: '/category-form',
              params: { id: item.id, name: item.name },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Editar ${item.name}`}
        >
          <RNText style={categoryNameStyle}>{item.name}</RNText>
          <View style={itemCountBadgeStyle}>
            <RNText style={itemCountTextStyle}>
              {item.itemCount} {item.itemCount === 1 ? 'item' : 'itens'}
            </RNText>
          </View>
        </Pressable>

        {/* Actions: toggle */}
        <View style={actionsStyle}>
          <ToggleSwitch
            value={isActive}
            onValueChange={() => handleToggleStatus(item)}
            disabled={isToggling}
            accessibilityLabel={`${item.name} está ${isActive ? 'ativa' : 'inativa'}`}
            testID={`toggle-category-${item.id}`}
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
              color: theme.colors.textSecondary,
              marginTop: 8,
            }}
          >
            Carregando categorias...
          </RNText>
        </View>
      );
    }

    if (error) {
      return (
        <ErrorState message={error} onRetry={() => loadCategories()} />
      );
    }

    if (categories.length === 0) {
      return (
        <View style={centeredContainerStyle} testID="empty-state">
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              color: theme.colors.textSecondary,
              textAlign: 'center',
            }}
          >
            Nenhuma categoria cadastrada
          </RNText>
        </View>
      );
    }

    return (
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderCategoryCard}
        contentContainerStyle={{ gap: 12 }}
        showsVerticalScrollIndicator
        ListFooterComponent={
          <Pressable
            style={[novaCategoriaButtonStyle, { marginTop: 12 }]}
            onPress={() => router.push('/category-form')}
            accessibilityRole="button"
            accessibilityLabel="Adicionar"
            accessibilityHint="Navega para a tela de criação de categoria"
            testID="new-category-button"
          >
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 16, fontWeight: '400', color: theme.colors.text }}>+</RNText>
            <RNText style={novaCategoriaTextStyle}>Adicionar</RNText>
          </Pressable>
        }
      />
    );
  };

  return (
    <Screen padding={false}>
      {/* Header */}
      <Header title="Categorias" onBack={() => router.back()} />

      {/* Content */}
      <View style={contentStyle}>
        {renderContent()}
      </View>

      {/* Bottom Navigation */}
      <BottomNav />
    </Screen>
  );
}
