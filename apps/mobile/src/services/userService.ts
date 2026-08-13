import { tokenStorage } from './token-storage';
import type {
  UserResponse,
  ListUsersResponse,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserStatus,
} from '../types/user';
import * as usersMock from '../mocks/users.mock';

const PROTOTYPE_MODE = process.env.EXPO_PUBLIC_PROTOTYPE_MODE === 'true';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

class NetworkError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'NetworkError';
  }
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await tokenStorage.getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await tokenStorage.clear();
    throw new NetworkError('Sessão expirada. Faça login novamente.', 401);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new NetworkError(
      body.message || `Erro ${response.status}`,
      response.status,
    );
  }

  return response;
}

export async function listUsers(filters?: UserFilters): Promise<ListUsersResponse> {
  if (PROTOTYPE_MODE) return usersMock.listUsers(filters);

  const params = new URLSearchParams();

  if (filters?.role) {
    params.set('role', filters.role);
  }
  if (filters?.status) {
    params.set('status', filters.status);
  }

  const query = params.toString();
  const path = query ? `/api/users?${query}` : '/api/users';

  const response = await authFetch(path);
  const data = await response.json() as ListUsersResponse;
  return data;
}

export async function getUserById(id: string): Promise<UserResponse> {
  if (PROTOTYPE_MODE) return usersMock.getUserById(id);

  const response = await authFetch(`/api/users/${id}`);
  const data = await response.json() as UserResponse;
  return data;
}

export async function createUser(data: CreateUserInput): Promise<UserResponse> {
  if (PROTOTYPE_MODE) return usersMock.createUser(data);

  const response = await authFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json() as UserResponse;
  return result;
}

export async function updateUser(id: string, data: UpdateUserInput): Promise<UserResponse> {
  if (PROTOTYPE_MODE) return usersMock.updateUser(id, data);

  const response = await authFetch(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  const result = await response.json() as UserResponse;
  return result;
}

export async function toggleUserStatus(id: string, status: UserStatus): Promise<UserResponse> {
  if (PROTOTYPE_MODE) return usersMock.toggleUserStatus(id, status);

  const response = await authFetch(`/api/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  const result = await response.json() as UserResponse;
  return result;
}

export async function deleteUser(id: string): Promise<void> {
  if (PROTOTYPE_MODE) return usersMock.deleteUser(id);

  await authFetch(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

export async function resetPassword(id: string, password: string): Promise<void> {
  if (PROTOTYPE_MODE) return usersMock.resetPassword(id, password);

  await authFetch(`/api/users/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });
}
