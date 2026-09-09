// Global test setup

// Mock expo-network to avoid native calls and open timers in tests
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'WIFI',
  }),
}));

// Mock global do react-native-webview: o WebView depende de um TurboModule
// nativo (RNCWebViewModule) que não existe no ambiente jest. Como o barrel
// `src/components` reexporta o mapa nativo (que importa a lib), qualquer teste
// que use componentes quebraria sem este mock. Testes que precisam inspecionar
// o WebView (ex.: o do mapa nativo) sobrepõem este mock localmente.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { WebView: (props) => React.createElement(View, { testID: props.testID }) };
});
