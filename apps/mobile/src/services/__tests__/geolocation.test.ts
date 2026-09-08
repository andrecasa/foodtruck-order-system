/**
 * Feature: order-location — captura opcional de geolocalização no cliente
 *
 * `getCurrentCoordinates()` nunca lança e sempre resolve com as coordenadas ou
 * `null`, de modo que a criação do pedido nunca é bloqueada pela localização:
 * - Web (PWA): usa `navigator.geolocation`; sucesso => coords; erro (permissão
 *   negada/timeout) ou API ausente => null.
 * - Nativo: usa `expo-location`; permissão concedida => coords; negada => null;
 *   erro => null.
 * O backend permanece a autoridade final (colunas nuláveis).
 */

// Controla o Platform.OS por teste (default: web). Prefixo `mock` é exigido
// pelo babel-jest para poder ser referenciado dentro de jest.mock().
let mockPlatformOS: 'web' | 'ios' | 'android' = 'web';
jest.mock('react-native', () => ({
  get Platform() {
    return { get OS() { return mockPlatformOS; } };
  },
}));

// Mock de expo-location para o caminho nativo.
const mockRequestPermissions = jest.fn();
const mockGetCurrentPosition = jest.fn();
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPosition(...args),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
}));

import { getCurrentCoordinates } from '../geolocation';

describe('getCurrentCoordinates — captura opcional de localização', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    jest.clearAllMocks();
    // Restaura o navigator original entre testes.
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  /** Substitui `navigator.geolocation` por um stub controlado. */
  function setWebGeolocation(geolocation: unknown): void {
    Object.defineProperty(global, 'navigator', {
      value: geolocation === undefined ? {} : { geolocation },
      configurable: true,
      writable: true,
    });
  }

  describe('web (PWA)', () => {
    beforeEach(() => {
      mockPlatformOS = 'web';
    });

    it('retorna as coordenadas em caso de sucesso', async () => {
      setWebGeolocation({
        getCurrentPosition: (success: (pos: unknown) => void) =>
          success({ coords: { latitude: -23.5613, longitude: -46.6565 } }),
      });

      await expect(getCurrentCoordinates()).resolves.toEqual({
        latitude: -23.5613,
        longitude: -46.6565,
      });
    });

    it('retorna null quando a permissão é negada (callback de erro)', async () => {
      setWebGeolocation({
        getCurrentPosition: (_success: unknown, error: (err: unknown) => void) =>
          error({ code: 1, message: 'User denied Geolocation' }),
      });

      await expect(getCurrentCoordinates()).resolves.toBeNull();
    });

    it('retorna null quando a API de geolocalização não existe', async () => {
      setWebGeolocation(undefined);
      await expect(getCurrentCoordinates()).resolves.toBeNull();
    });
  });

  describe('nativo (Expo)', () => {
    beforeEach(() => {
      mockPlatformOS = 'ios';
    });

    it('retorna as coordenadas quando a permissão é concedida', async () => {
      mockRequestPermissions.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPosition.mockResolvedValue({
        coords: { latitude: -23.5, longitude: -46.6 },
      });

      await expect(getCurrentCoordinates()).resolves.toEqual({
        latitude: -23.5,
        longitude: -46.6,
      });
    });

    it('retorna null quando a permissão é negada (sem chamar getCurrentPosition)', async () => {
      mockRequestPermissions.mockResolvedValue({ status: 'denied' });

      await expect(getCurrentCoordinates()).resolves.toBeNull();
      expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    });

    it('retorna null quando ocorre um erro ao obter a posição', async () => {
      mockRequestPermissions.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPosition.mockRejectedValue(new Error('GPS indisponível'));

      await expect(getCurrentCoordinates()).resolves.toBeNull();
    });
  });
});
