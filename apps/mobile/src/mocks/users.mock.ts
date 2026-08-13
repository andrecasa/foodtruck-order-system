import type {
  User,
  UserResponse,
  ListUsersResponse,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserStatus,
} from '../types/user';

// --- Helpers (same pattern as mock-client.ts) ---

function generateId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function delay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Initial mock data (4 users from Penpot design) ---

const initialUsers: User[] = [
  {
    id: 'user-001',
    name: 'André Silva',
    email: 'andre.silva@email.com',
    role: 'admin',
    status: 'ativo',
    createdAt: '2024-01-10T08:00:00.000Z',
    updatedAt: '2024-01-10T08:00:00.000Z',
  },
  {
    id: 'user-002',
    name: 'Maria Santos',
    email: 'maria.santos@email.com',
    role: 'atendente',
    status: 'ativo',
    createdAt: '2024-01-11T09:00:00.000Z',
    updatedAt: '2024-01-11T09:00:00.000Z',
  },
  {
    id: 'user-003',
    name: 'João Oliveira',
    email: 'joao.oliveira@email.com',
    role: 'preparador',
    status: 'ativo',
    createdAt: '2024-01-12T10:00:00.000Z',
    updatedAt: '2024-01-12T10:00:00.000Z',
  },
  {
    id: 'user-004',
    name: 'Carlos Lima',
    email: 'carlos.lima@email.com',
    role: 'atendente',
    status: 'inativo',
    createdAt: '2024-01-13T11:00:00.000Z',
    updatedAt: '2024-01-13T11:00:00.000Z',
  },
];

// --- In-memory state ---

let usersState: User[] = [...initialUsers];

// --- Mock CRUD operations ---

export async function listUsers(filters?: UserFilters): Promise<ListUsersResponse> {
  await delay();

  let result = [...usersState];

  if (filters?.role) {
    result = result.filter((u) => u.role === filters.role);
  }
  if (filters?.status) {
    result = result.filter((u) => u.status === filters.status);
  }

  result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  return { users: result, total: result.length };
}

export async function getUserById(id: string): Promise<UserResponse> {
  await delay();

  const user = usersState.find((u) => u.id === id);
  if (!user) {
    throw new Error('Usuário não encontrado (404)');
  }

  return user;
}

export async function createUser(data: CreateUserInput): Promise<UserResponse> {
  await delay();

  const duplicate = usersState.find(
    (u) => u.email.toLowerCase() === data.email.toLowerCase(),
  );
  if (duplicate) {
    throw new Error('E-mail já cadastrado (409)');
  }

  if (!data.name || !data.email || !data.password || !data.role) {
    throw new Error('Dados obrigatórios não informados (422)');
  }

  const timestamp = now();
  const newUser: User = {
    id: generateId(),
    name: data.name,
    email: data.email,
    role: data.role,
    status: 'ativo',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  usersState.push(newUser);
  return newUser;
}

export async function updateUser(id: string, data: UpdateUserInput): Promise<UserResponse> {
  await delay();

  const index = usersState.findIndex((u) => u.id === id);
  if (index === -1) {
    throw new Error('Usuário não encontrado (404)');
  }

  if (data.email) {
    const duplicate = usersState.find(
      (u) => u.id !== id && u.email.toLowerCase() === data.email!.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('E-mail já cadastrado (409)');
    }
  }

  const existing = usersState[index]!;
  const updated: User = {
    ...existing,
    ...(data.name !== undefined && { name: data.name }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.role !== undefined && { role: data.role }),
    updatedAt: now(),
  };

  usersState[index] = updated;
  return updated;
}

export async function toggleUserStatus(id: string, status: UserStatus): Promise<UserResponse> {
  await delay();

  const index = usersState.findIndex((u) => u.id === id);
  if (index === -1) {
    throw new Error('Usuário não encontrado (404)');
  }

  const existing = usersState[index]!;
  const updated: User = {
    ...existing,
    status,
    updatedAt: now(),
  };

  usersState[index] = updated;
  return updated;
}

export async function deleteUser(id: string): Promise<void> {
  await delay();

  const index = usersState.findIndex((u) => u.id === id);
  if (index === -1) {
    throw new Error('Usuário não encontrado (404)');
  }

  usersState.splice(index, 1);
}

export async function resetPassword(id: string, _password: string): Promise<void> {
  await delay();

  const user = usersState.find((u) => u.id === id);
  if (!user) {
    throw new Error('Usuário não encontrado (404)');
  }

  // In prototype mode we just simulate success (password not stored in mock)
}
