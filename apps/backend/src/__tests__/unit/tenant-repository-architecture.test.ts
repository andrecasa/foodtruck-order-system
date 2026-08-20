import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Architecture test: the isolation boundary of the centralized data-access
 * helper (TenantRepository).
 *
 * Requirement 5.6 states that domain controllers and services MUST access
 * tenant-scoped data exclusively through the Data_Access_Helper. To enforce
 * this by construction, no file under `src/services/**` may import the shared
 * `config/database.js` pool directly — they must go through
 * `tenantRepository(tenantId)`.
 *
 * TARGET STATE: the `NOT_YET_REFACTORED` allowlist below is EMPTY. Every entry
 * is a tenant-scoped service that has not yet been refactored to use the
 * TenantRepository (spec tasks 7–10). As each service is migrated, it MUST be
 * removed from the allowlist. When the allowlist is empty this test enforces the
 * full boundary. Any NEW tenant-scoped service file that imports the pool
 * directly fails immediately, since it will not be on the list.
 *
 * PLATFORM EXEMPTION: a small, explicit `PLATFORM_SERVICES` allowlist exempts
 * platform-level services that legitimately operate OUTSIDE any tenant scope
 * (e.g. the onboarding / provisioning service, which CREATES tenants inside a
 * single atomic transaction spanning `tenants`, `users`, categories and menu
 * items). These are not tenant-scoped domain services, so going through
 * `tenantRepository(tenantId)` would be incorrect — they belong with the
 * migration runner as platform tooling. This keeps the tenant-scoped boundary
 * intact and documented while allowing legitimate platform operations.
 *
 * **Validates: Requirements 5.1, 5.6, 5.7**
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVICES_DIR = join(__dirname, '../../services');

/**
 * Services still importing the pool directly (pre-refactor, spec tasks 7–10).
 * Do NOT add to this list. Remove entries as services are migrated to the
 * TenantRepository; the goal is an empty allowlist.
 */
const NOT_YET_REFACTORED = new Set<string>([]);

/**
 * PLATFORM-level services that legitimately use the shared pool directly because
 * they operate OUTSIDE any single tenant scope (they provision / manage tenants
 * themselves). These are permanently exempt from the tenant-scoped boundary and
 * are NOT part of the "migrate to empty" goal that governs NOT_YET_REFACTORED.
 */
const PLATFORM_SERVICES = new Set<string>([
  'tenant-provision.service.ts',
]);

const DB_IMPORT_RE = /import\s+[^;]*from\s+['"][^'"]*config\/database\.js['"]/;

async function listServiceFiles(): Promise<string[]> {
  const entries = await readdir(SERVICES_DIR);
  return entries.filter((f) => f.endsWith('.ts'));
}

describe('Architecture: services must not import config/database.js directly (R5.6)', () => {
  it('no NEW / already-refactored service imports the shared pool directly', async () => {
    const files = await listServiceFiles();
    const violations: string[] = [];

    for (const file of files) {
      const contents = await readFile(join(SERVICES_DIR, file), 'utf-8');
      if (
        DB_IMPORT_RE.test(contents) &&
        !NOT_YET_REFACTORED.has(file) &&
        !PLATFORM_SERVICES.has(file)
      ) {
        violations.push(file);
      }
    }

    expect(
      violations,
      `These services import config/database.js directly but must use tenantRepository() instead: ${violations.join(', ')}`,
    ).toEqual([]);
  });

  it('documents the remaining services to migrate (allowlist should reach empty)', async () => {
    // This assertion guards the allowlist against silently listing files that no
    // longer import the pool (which would hide progress) or files that no longer
    // exist. It keeps the target-state documentation honest.
    const files = new Set(await listServiceFiles());

    for (const allowed of NOT_YET_REFACTORED) {
      expect(files.has(allowed), `Allowlisted service ${allowed} no longer exists`).toBe(true);
      const contents = await readFile(join(SERVICES_DIR, allowed), 'utf-8');
      expect(
        DB_IMPORT_RE.test(contents),
        `${allowed} no longer imports config/database.js — remove it from NOT_YET_REFACTORED`,
      ).toBe(true);
    }
  });

  it('keeps the PLATFORM_SERVICES exemption honest (each file exists and uses the pool)', async () => {
    // Guards the permanent platform exemption: every exempt file must still exist
    // and actually import the pool. If a platform service stops importing the
    // pool, it should be removed from PLATFORM_SERVICES rather than lingering.
    const files = new Set(await listServiceFiles());

    for (const allowed of PLATFORM_SERVICES) {
      expect(files.has(allowed), `Platform-exempt service ${allowed} no longer exists`).toBe(true);
      const contents = await readFile(join(SERVICES_DIR, allowed), 'utf-8');
      expect(
        DB_IMPORT_RE.test(contents),
        `${allowed} no longer imports config/database.js — remove it from PLATFORM_SERVICES`,
      ).toBe(true);
    }
  });
});
