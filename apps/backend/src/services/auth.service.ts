import { SESSION_DURATION_HOURS } from '@order-system/shared';
import { supabase } from '../config/supabase.js';

// --- Interfaces ---

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string | undefined;
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// --- Error classes ---

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// --- Service functions ---

/**
 * Authenticates a user with email and password via Supabase.
 * Returns session tokens on success, throws ServiceError on failure.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session) {
    throw new ServiceError(
      'E-mail ou senha incorretos',
      401,
      'INVALID_CREDENTIALS',
    );
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: SESSION_DURATION_HOURS * 3600,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  };
}

/**
 * Signs out the current session via Supabase.
 */
export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new ServiceError(
      'Falha ao encerrar sessão.',
      500,
      'LOGOUT_FAILED',
    );
  }
}

/**
 * Refreshes the access token using a refresh token.
 */
export async function refreshToken(token: string): Promise<RefreshResult> {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: token,
  });

  if (error || !data.session) {
    throw new ServiceError(
      'Refresh token inválido ou expirado.',
      401,
      'INVALID_REFRESH_TOKEN',
    );
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: SESSION_DURATION_HOURS * 3600,
  };
}
