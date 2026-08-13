export type UserRole = 'admin' | 'atendente' | 'preparador';

export type UserStatus = 'ativo' | 'inativo';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export type UserResponse = User;

export interface ListUsersResponse {
  users: UserResponse[];
  total: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
}

export interface UserFilters {
  role?: UserRole;
  status?: UserStatus;
}
