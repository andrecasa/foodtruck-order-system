import React from 'react';
import { View, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Screen } from '../../components/Layout';
import { FormScreen } from '../../components/FormScreen';

/**
 * Regressão do "espaço entre o último item e a bottom nav" que só aparecia no
 * device (onde `insets.bottom > 0`).
 *
 * Causa: telas dentro do navegador de abas aplicavam o safe-area inset inferior
 * no próprio container (`Screen`/`FormScreen`) enquanto a barra de abas já
 * reserva `insets.bottom` (ver `app/(tabs)/_layout.tsx`) — duplicando o inset e
 * empurrando o CTA/total flutuante para cima da bottom nav.
 *
 * Estes testes fixam o contrato do `edges`: por padrão os containers aplicam o
 * inset inferior (telas de stack, sem bottom nav), e telas de aba devem passar
 * `['top']` para não duplicá-lo. Validamos encaminhando `edges` ao SafeAreaView.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

// SafeAreaView é substituído por uma View que expõe as `edges` recebidas via
// prop, permitindo asserção direta sobre quais bordas o container solicita.
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, edges, style }: any) => (
      <RN.View testID="safe-area" style={style} accessibilityValue={{ text: JSON.stringify(edges ?? null) }}>
        {children}
      </RN.View>
    ),
  };
});

jest.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function edgesOf(getByTestId: (id: string) => { props: { accessibilityValue?: { text?: string } } }): unknown {
  const text = getByTestId('safe-area').props.accessibilityValue?.text;
  return text ? JSON.parse(text) : undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Screen safe-area edges', () => {
  it('by default lets the SafeAreaView apply all edges (stack screens keep the bottom inset)', () => {
    const { getByTestId } = render(
      <Screen padding={false}>
        <Text>conteúdo</Text>
      </Screen>,
    );

    // `edges` não informado → SafeAreaView usa o padrão (todas as bordas).
    expect(edgesOf(getByTestId)).toBeNull();
  });

  it('forwards edges to the SafeAreaView so tab screens can drop the bottom inset', () => {
    const { getByTestId } = render(
      <Screen padding={false} edges={['top']}>
        <Text>conteúdo</Text>
      </Screen>,
    );

    expect(edgesOf(getByTestId)).toEqual(['top']);
  });
});

describe('FormScreen safe-area edges', () => {
  it('defaults to top + bottom (stack form screens keep the bottom inset)', () => {
    const { getByTestId } = render(
      <FormScreen title="Teste">
        <View />
      </FormScreen>,
    );

    expect(edgesOf(getByTestId)).toEqual(['top', 'bottom']);
  });

  it('forwards edges so tab form screens can drop the bottom inset', () => {
    const { getByTestId } = render(
      <FormScreen title="Teste" edges={['top']}>
        <View />
      </FormScreen>,
    );

    expect(edgesOf(getByTestId)).toEqual(['top']);
  });
});
