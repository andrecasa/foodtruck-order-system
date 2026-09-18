import { View, Text as RNText, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { withOpacity } from '../utils/color';
import type { UserRole } from '../types/user';

/** Rótulos das funções de usuário (pt-BR). */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  atendente: 'Atendente',
  preparador: 'Preparador',
};

/** Ícones (Material Symbols Outlined) por função. */
export const ROLE_ICONS: Record<UserRole, string> = {
  admin: 'admin_panel_settings',
  atendente: 'headset_mic',
  preparador: 'restaurant',
};

// Dimensões específicas do badge (não pertencem à escala do tema — são
// medidas próprias deste selo compacto, mantidas como constantes nomeadas).
const BADGE_HEIGHT = 18;
const BADGE_RADIUS = 9;
const BADGE_ICON_SIZE = 11;
const BADGE_LABEL_SIZE = 9;
/** Opacidade do fundo do badge (cor da função a 12%). */
const BADGE_BG_OPACITY = 0.12;

export interface RoleBadgeProps {
  /** Função do usuário que define cor, ícone e rótulo. */
  role: UserRole;
}

/**
 * Selo (badge) compacto que identifica a função de um usuário — ícone + rótulo,
 * com a cor da função (Admin=primary, Atendente=preparando, Preparador=success)
 * e fundo na mesma cor a 12%.
 *
 * Componente único compartilhado por `UsersListScreen` (card da lista) e
 * `UserDetailScreen` (card de detalhe), eliminando a duplicação que existia
 * entre as duas telas.
 */
export function RoleBadge({ role }: RoleBadgeProps) {
  const theme = useTheme();

  const roleColors: Record<UserRole, string> = {
    admin: theme.colors.primary,
    atendente: theme.colors.preparando,
    preparador: theme.colors.success,
  };

  const color = roleColors[role];

  const containerStyle: ViewStyle = {
    backgroundColor: withOpacity(color, BADGE_BG_OPACITY),
    borderRadius: BADGE_RADIUS,
    paddingHorizontal: 6,
    paddingRight: 8,
    height: BADGE_HEIGHT,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  };

  return (
    <View style={containerStyle} accessibilityRole="text" accessibilityLabel={ROLE_LABELS[role]}>
      <RNText
        style={{ fontFamily: 'Material Symbols Outlined', fontSize: BADGE_ICON_SIZE, fontWeight: '400', color }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {ROLE_ICONS[role]}
      </RNText>
      <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: BADGE_LABEL_SIZE, fontWeight: '400', color }}>
        {ROLE_LABELS[role]}
      </RNText>
    </View>
  );
}
