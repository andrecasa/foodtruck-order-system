import '@testing-library/jest-dom';

// Provide a minimal import.meta.env for tests
// Vitest automatically provides import.meta.env, but we set defaults here
(globalThis as any).__VITE_PROTOTYPE_MODE__ = 'true';
