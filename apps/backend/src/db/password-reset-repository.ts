import { pool } from '../config/database.js';

/**
 * Repository for the public "forgot password" flow.
 *
 * ARCHITECTURAL EXCEPTION (documented in
 * `.kiro/specs/forgot-password/design.md`): this flow is public and runs
 * WITHOUT `tenantMiddleware`, so there is no resolved `tenant_id` on the
 * request. The `TenantRepository` requires a tenant by construction and cannot
 * be used here. Therefore this repository talks directly to the shared `pool`
 * — the same exception already granted to the migration runner and the
 * provisioning tooling.
 *
 * Tenant isolation is preserved explicitly:
 *   - generation is parameterized by `(email)` and results carry
 *     `(user_id, tenant_id)`;
 *   - validation and invalidation are parameterized by `(user_id, tenant_id)`
 *     or by the code's own `id`, and the composite FK
 *     `(user_id, tenant_id) → users(id, tenant_id)` guarantees a code can never
 *     be associated with a user of a different tenant.
 *
 * EVERY statement in this module is fully parameterized (`$1`, `$2`, ...).
 */

/** A user matched by email during code generation. */
export interface ActiveUser {
  id: string;
  tenant_id: string;
  email: string;
  status: 'ativo' | 'inativo';
}

/** A row of the `password_reset_codes` table. */
export interface PasswordResetCodeRow {
  id: string;
  user_id: string;
  tenant_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  attempts: number;
  created_at: Date;
}

/** Maximum number of incorrect validation attempts before a code is invalidated. */
const MAX_ATTEMPTS = 5;

export interface PasswordResetRepository {
  /** Returns ALL users (any tenant) whose LOWER(email) matches. */
  findUsersByEmail(email: string): Promise<ActiveUser[]>;
  /** Invalidates (marks as used) every still-valid code of a user+tenant. */
  invalidateActiveCodes(userId: string, tenantId: string): Promise<void>;
  /** Inserts a new code already hashed and with `expires_at`. */
  insertCode(input: {
    userId: string;
    tenantId: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetCodeRow>;
  /** Most recent active code for the email (join users) — validation candidate. */
  findActiveCodeForEmail(email: string): Promise<PasswordResetCodeRow | null>;
  /** Increments attempts; invalidates when reaching 5. Returns the updated row. */
  registerFailedAttempt(codeId: string): Promise<PasswordResetCodeRow>;
  /** Marks the code as used (used_at = now). */
  markUsed(codeId: string): Promise<void>;
  /** Marks a specific code as invalidated (used for email-failure rollback). */
  invalidateCode(codeId: string): Promise<void>;
}

async function findUsersByEmail(email: string): Promise<ActiveUser[]> {
  // Cross-tenant match by normalized email (R8.3): every tenant sharing the
  // email is returned; the service decides which ones are `ativo`.
  const result = await pool.query(
    `SELECT id, tenant_id, email, status
       FROM users
      WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  return result.rows as ActiveUser[];
}

async function invalidateActiveCodes(userId: string, tenantId: string): Promise<void> {
  // A new code invalidates the still-valid ones of the same user+tenant (R3.5).
  // "Valid" = not used and not expired; setting used_at marks them invalid.
  await pool.query(
    `UPDATE password_reset_codes
        SET used_at = NOW()
      WHERE user_id = $1
        AND tenant_id = $2
        AND used_at IS NULL
        AND expires_at > NOW()`,
    [userId, tenantId],
  );
}

async function insertCode(input: {
  userId: string;
  tenantId: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<PasswordResetCodeRow> {
  const result = await pool.query(
    `INSERT INTO password_reset_codes (user_id, tenant_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, tenant_id, code_hash, expires_at, used_at, attempts, created_at`,
    [input.userId, input.tenantId, input.codeHash, input.expiresAt],
  );
  return result.rows[0] as PasswordResetCodeRow;
}

async function findActiveCodeForEmail(email: string): Promise<PasswordResetCodeRow | null> {
  // Candidate for validation: most recent active code whose owning user matches
  // the email. Active = used_at IS NULL AND expires_at > NOW() AND attempts < 5.
  // The row carries (user_id, tenant_id), so tenant scope is preserved (R8.5).
  const result = await pool.query(
    `SELECT c.id, c.user_id, c.tenant_id, c.code_hash, c.expires_at,
            c.used_at, c.attempts, c.created_at
       FROM password_reset_codes c
       JOIN users u
         ON u.id = c.user_id
        AND u.tenant_id = c.tenant_id
      WHERE LOWER(u.email) = LOWER($1)
        AND c.used_at IS NULL
        AND c.expires_at > NOW()
        AND c.attempts < $2
      ORDER BY c.created_at DESC
      LIMIT 1`,
    [email, MAX_ATTEMPTS],
  );
  return result.rows.length > 0 ? (result.rows[0] as PasswordResetCodeRow) : null;
}

async function registerFailedAttempt(codeId: string): Promise<PasswordResetCodeRow> {
  // Increment attempts and, on reaching the limit (R3.6/R6.4), invalidate the
  // code atomically by setting used_at. Both effects in a single statement.
  const result = await pool.query(
    `UPDATE password_reset_codes
        SET attempts = attempts + 1,
            used_at = CASE
              WHEN attempts + 1 >= $2 AND used_at IS NULL THEN NOW()
              ELSE used_at
            END
      WHERE id = $1
      RETURNING id, user_id, tenant_id, code_hash, expires_at, used_at, attempts, created_at`,
    [codeId, MAX_ATTEMPTS],
  );
  return result.rows[0] as PasswordResetCodeRow;
}

async function markUsed(codeId: string): Promise<void> {
  await pool.query(
    `UPDATE password_reset_codes
        SET used_at = NOW()
      WHERE id = $1
        AND used_at IS NULL`,
    [codeId],
  );
}

async function invalidateCode(codeId: string): Promise<void> {
  // Rollback for a total email-send failure (R2.7): the generated code must end
  // up invalidated. Marking used_at is the single "no longer valid" state.
  await pool.query(
    `UPDATE password_reset_codes
        SET used_at = NOW()
      WHERE id = $1
        AND used_at IS NULL`,
    [codeId],
  );
}

export const passwordResetRepository: PasswordResetRepository = {
  findUsersByEmail,
  invalidateActiveCodes,
  insertCode,
  findActiveCodeForEmail,
  registerFailedAttempt,
  markUsed,
  invalidateCode,
};
