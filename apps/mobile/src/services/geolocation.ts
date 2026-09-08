/**
 * Captura opcional de geolocalização do cliente ao confirmar um pedido.
 *
 * Objetivo: registrar latitude/longitude no pedido quando o cliente permitir.
 * A captura é SEMPRE opcional — o pedido deve ser criado com ou sem
 * coordenadas. Por isso todas as funções aqui são tolerantes a falha: nunca
 * lançam, e retornam `null` quando a localização não está disponível
 * (permissão negada, dispositivo sem GPS, timeout, API ausente, etc.). O
 * backend permanece a autoridade final (colunas nuláveis + validação Zod).
 *
 * Suporta os dois runtimes do app:
 * - Web / PWA (react-native-web): usa a API `navigator.geolocation` do
 *   navegador. Requer HTTPS e consentimento explícito do usuário.
 * - Nativo (Expo): usa `expo-location`, pedindo permissão de foreground.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';

/** Coordenadas capturadas do dispositivo/navegador. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Tempo máximo (ms) de espera por uma posição antes de desistir. Mantido curto
 * para não atrasar a confirmação do pedido caso o GPS demore a responder.
 */
export const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * Captura a posição atual no ambiente WEB usando `navigator.geolocation`.
 * Resolve com as coordenadas ou `null` (permissão negada, timeout, API
 * ausente). Nunca rejeita.
 */
function getWebPosition(): Promise<Coordinates | null> {
  // `navigator.geolocation` não existe em navegadores muito antigos ou quando o
  // header Permissions-Policy desabilita a API — trate como indisponível.
  if (
    typeof navigator === 'undefined' ||
    !('geolocation' in navigator) ||
    !navigator.geolocation
  ) {
    return Promise.resolve(null);
  }

  return new Promise<Coordinates | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      // Qualquer erro (permissão negada, indisponível, timeout) => sem coords.
      () => resolve(null),
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

/**
 * Captura a posição atual no ambiente NATIVO usando `expo-location`. Pede
 * permissão de foreground; resolve com as coordenadas ou `null` se a permissão
 * for negada ou ocorrer qualquer erro. Nunca rejeita.
 */
async function getNativePosition(): Promise<Coordinates | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    // Falha ao obter a posição não bloqueia o pedido.
    return null;
  }
}

/**
 * Tenta capturar as coordenadas atuais do cliente, escolhendo a estratégia
 * conforme a plataforma. Retorna `null` quando a localização não está
 * disponível — o chamador deve seguir com a criação do pedido normalmente.
 */
export function getCurrentCoordinates(): Promise<Coordinates | null> {
  return Platform.OS === 'web' ? getWebPosition() : getNativePosition();
}
