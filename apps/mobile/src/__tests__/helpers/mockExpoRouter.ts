/**
 * Helpers de mock do `expo-router` para testes.
 *
 * Vários testes de tela precisam mockar o `useFocusEffect` para rodar o callback
 * de foco uma vez (como um efeito de montagem). Esse mock estava duplicado em
 * ~7 arquivos, cada um repetindo o mesmo `useEffect(cb, [])` — e cada cópia
 * disparava o warning `react-hooks/exhaustive-deps` (dep `cb` ausente). Aqui a
 * implementação fica num único lugar, com o disable concentrado.
 *
 * O nome começa com `use` de propósito: é um hook (chama `useEffect`), então a
 * regra `react-hooks/rules-of-hooks` exige o prefixo.
 *
 * Uso dentro de um `jest.mock('expo-router', ...)` (o factory é "hoisted", então
 * o `require` deve acontecer DENTRO dele):
 *
 *   jest.mock('expo-router', () => ({
 *     useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
 *     useFocusEffect: require('../helpers/mockExpoRouter').useMockFocusEffect,
 *   }));
 */
import { useEffect } from 'react';

/**
 * Implementação de `useFocusEffect` para testes: executa `cb` uma vez, na
 * montagem. O array de dependências é intencionalmente vazio — o objetivo é
 * simular o foco inicial da tela, não re-executar quando `cb` muda.
 */
export function useMockFocusEffect(cb: () => void | (() => void)): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => cb(), []);
}
