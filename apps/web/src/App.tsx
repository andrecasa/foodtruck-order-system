import type { RouteObject } from 'react-router';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { LandingPage } from './pages/LandingPage';
import { SignupPage } from './pages/SignupPage';

/**
 * Configuração de rotas do Web_Router público (R2.1/R2.3).
 *
 * O `apps/web` serve apenas rotas públicas — não há mais roteamento por estado
 * de autenticação (`useAuth`). As rotas são:
 * - `/` → Landing_Page (divulgação)
 * - `/signup` → Signup_Form (onboarding self-service)
 * - `*` (catch-all) → redireciona para `/`, direcionando qualquer rota não
 *   pública (incluindo as antigas telas autenticadas) para a Landing_Page (R2.3).
 *
 * Exportado como fonte única da verdade das rotas para que os testes possam
 * montar um roteador equivalente (`createMemoryRouter`) sem duplicar a config.
 */
export const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

const router = createBrowserRouter(routes);

/**
 * Componente raiz do `apps/web`: monta o Web_Router público.
 */
export function App() {
  return <RouterProvider router={router} />;
}
