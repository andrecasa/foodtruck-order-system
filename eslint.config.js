// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

/**
 * Configuração ESLint (flat config) para o monorepo order-system.
 *
 * Uma única configuração na raiz cobre todos os workspaces (`apps/*`,
 * `packages/*`). Cada `pnpm --filter <app> lint` roda `eslint src/`, que herda
 * esta config por estar na raiz do repositório.
 *
 * Camadas:
 *  1. Ignorados globais (build, deps, config gerada).
 *  2. Regras base (JS recomendado + TypeScript recomendado, sem type-checking
 *     de tipos — mais rápido e não exige `project` em cada workspace).
 *  3. Padrões do projeto (ver `.kiro/steering/`): evitar `any`, avisar sobre
 *     variáveis não usadas (permitindo prefixo `_`), etc.
 *  4. Overrides por contexto: React Hooks para mobile/web; ambiente de testes.
 *
 * Formatação NÃO é responsabilidade do ESLint aqui (não há Prettier no repo);
 * mantemos apenas regras de qualidade/correção.
 */
export default defineConfig(
  // 1. Ignorados globais ------------------------------------------------------
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.config.js',
      '**/*.config.ts',
      '**/babel.config.js',
      '**/metro.config.js',
    ],
  },

  // 2. Regras base para todo TS/TSX ------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 3. Padrões do projeto (aplicados a todo o código) -------------------------
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Tipagem precisa: `any` é aviso, não erro, para não travar o fluxo, mas
      // sinaliza dívida. Use `unknown` + narrowing quando possível.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Variáveis/args/erros não usados são avisos; prefixe com `_` para
      // silenciar intencionalmente (ex.: `_next` no errorHandler do Express).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // Permite `const { campo, ...rest } = obj` para descartar `campo`
          // intencionalmente (padrão comum em testes de validação de schema).
          ignoreRestSiblings: true,
        },
      ],

      // Consistência de imports de tipo (casa com o uso de `import type` já
      // presente no código).
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Boas práticas gerais.
      'no-console': 'off', // logs deliberados existem (ex.: logError, bot).
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },

  // 4a. Mobile e Web: regras de React Hooks -----------------------------------
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // 4a-bis. Mobile: `require()` de assets é idiomático no React Native --------
  // (ex.: `require('../../assets/logo.png')`), então não é tratado como erro.
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // 4b. Testes: relaxa regras que atrapalham cenários de teste ----------------
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
