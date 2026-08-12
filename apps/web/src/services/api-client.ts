import { mockClient } from '../mocks/mock-client';
import { realClient } from './real-client';

export type { ApiClient } from './types';

const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === 'true';

export const apiClient = PROTOTYPE_MODE ? mockClient : realClient;
