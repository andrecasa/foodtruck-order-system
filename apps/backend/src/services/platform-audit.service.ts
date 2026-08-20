/**
 * Platform audit trail helper.
 *
 * When a tenant-management operation is executed by a Platform_Admin, the
 * platform records an audit trail entry containing, at minimum, the actor
 * identifier and the operation performed (Requirement 10.7).
 *
 * This module provides a single `logPlatformAction` entry point used by the
 * `/api/platform/*` handlers. The concrete tenant-management endpoints (e.g.
 * `POST /api/platform/tenants`) are wired in a later task and will call this
 * helper as they act; for now it establishes the audit-logging contract and is
 * covered by unit tests.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md`
 *   section "Papel de Platform_Admin vs Tenant_Admin".
 * Requirements: 10.7.
 */

/** A single platform audit trail entry (actor + operation, at minimum). */
export interface PlatformAuditEntry {
  /** Identifier of the actor (the Platform_Admin performing the operation). */
  actorId: string;
  /** The operation performed (e.g. 'CREATE_TENANT', 'LIST_TENANTS'). */
  operation: string;
  /** Optional structured details about the operation (e.g. target tenant id). */
  details?: Record<string, unknown>;
  /** When the action occurred. */
  timestamp: string;
}

/** Sink that persists/emits audit entries. Defaults to structured logging. */
export type PlatformAuditSink = (entry: PlatformAuditEntry) => void;

function defaultSink(entry: PlatformAuditEntry): void {
  // Structured, greppable line: actor id + operation are always present (R10.7).
  console.info('[platform-audit]', JSON.stringify(entry));
}

let sink: PlatformAuditSink = defaultSink;

/**
 * Overrides the audit sink. Primarily for tests; production uses the default
 * structured logger.
 */
export function setPlatformAuditSink(next: PlatformAuditSink): void {
  sink = next;
}

/** Restores the default structured-logging sink. */
export function resetPlatformAuditSink(): void {
  sink = defaultSink;
}

/**
 * Records a platform action to the audit trail. Guarantees the actor id and the
 * operation are captured (Requirement 10.7). Returns the entry that was logged
 * so callers/tests can assert on it.
 *
 * @param actorId   Identifier of the Platform_Admin performing the operation.
 * @param operation The operation performed.
 * @param details   Optional structured details (e.g. target tenant id).
 */
export function logPlatformAction(
  actorId: string,
  operation: string,
  details?: Record<string, unknown>,
): PlatformAuditEntry {
  if (typeof actorId !== 'string' || actorId.trim() === '') {
    throw new Error('logPlatformAction requer um actorId (identificador do ator).');
  }
  if (typeof operation !== 'string' || operation.trim() === '') {
    throw new Error('logPlatformAction requer uma operation (operação realizada).');
  }

  const entry: PlatformAuditEntry = {
    actorId,
    operation,
    ...(details ? { details } : {}),
    timestamp: new Date().toISOString(),
  };

  sink(entry);
  return entry;
}
