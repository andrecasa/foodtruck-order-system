import { mockClient } from '../mocks/mock-client';
import { realClient } from './real-client';

export type { ApiClient } from './types';

// TODO: Switch to realClient when backend is ready
const PROTOTYPE_MODE = true;

export const apiClient = PROTOTYPE_MODE ? mockClient : realClient;
