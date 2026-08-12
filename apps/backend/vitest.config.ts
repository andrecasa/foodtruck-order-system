import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@order-system/shared': resolve(__dirname, '../../packages/shared/src'),
      '@/': resolve(__dirname, './src/'),
    },
  },
});
