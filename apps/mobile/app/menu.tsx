import React from 'react';
import { MenuScreen } from '../src/screens/MenuScreen';

/**
 * Route: /menu
 *
 * O Cardápio é uma tela de gestão empilhada no stack raiz (fora do grupo
 * `(tabs)`), no mesmo padrão de Categorias e Usuários: sem bottom nav, acessada
 * pelo DrawerMenu. Renderiza seu próprio Header com `onBack`, então não depende
 * da tab bar para navegação.
 */
export default function MenuRoute() {
  return <MenuScreen />;
}
