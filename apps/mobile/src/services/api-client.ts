import { mockClient } from '../mocks/mock-client';
import { realClient } from './real-client';

export type { ApiClient } from './types';

/**
 * Determines whether to use mock data or real backend.
 * Reads EXPO_PUBLIC_PROTOTYPE_MODE from environment variables.
 * When "true", uses mockClient; otherwise uses realClient.
 */
const PROTOTYPE_MODE = process.env.EXPO_PUBLIC_PROTOTYPE_MODE === 'true';

export const apiClient = PROTOTYPE_MODE ? mockClient : realClient;
