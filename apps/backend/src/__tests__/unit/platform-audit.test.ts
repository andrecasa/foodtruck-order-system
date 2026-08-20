import { describe, it, expect, afterEach } from 'vitest';

/**
 * Unit tests for the platform audit trail helper.
 *
 * When a tenant-management operation is executed by a Platform_Admin, the audit
 * trail records the actor id and the operation performed.
 *
 * **Validates: Requirements 10.7**
 */

import {
  logPlatformAction,
  setPlatformAuditSink,
  resetPlatformAuditSink,
  PlatformAuditEntry,
} from '../../services/platform-audit.service.js';

describe('Platform Audit Service - logPlatformAction', () => {
  afterEach(() => {
    resetPlatformAuditSink();
  });

  it('records actor id and operation in the audit trail (R10.7)', () => {
    const captured: PlatformAuditEntry[] = [];
    setPlatformAuditSink((entry) => captured.push(entry));

    const entry = logPlatformAction('admin-1', 'CREATE_TENANT');

    expect(captured).toHaveLength(1);
    expect(captured[0].actorId).toBe('admin-1');
    expect(captured[0].operation).toBe('CREATE_TENANT');
    expect(typeof captured[0].timestamp).toBe('string');
    expect(entry).toEqual(captured[0]);
  });

  it('includes optional structured details when provided (R10.7)', () => {
    const captured: PlatformAuditEntry[] = [];
    setPlatformAuditSink((entry) => captured.push(entry));

    logPlatformAction('admin-2', 'CREATE_TENANT', { tenantId: 'tenant-abc' });

    expect(captured[0].details).toEqual({ tenantId: 'tenant-abc' });
  });

  it('throws when actorId is missing', () => {
    expect(() => logPlatformAction('', 'CREATE_TENANT')).toThrow();
  });

  it('throws when operation is missing', () => {
    expect(() => logPlatformAction('admin-3', '')).toThrow();
  });
});
