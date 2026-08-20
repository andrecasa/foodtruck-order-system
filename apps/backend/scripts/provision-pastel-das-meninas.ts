/**
 * Provision the first tenant — "Pastel das Meninas" — using the recovered
 * onboarding preset (R9.6).
 *
 * This is a thin, runnable wrapper around the platform-level `provisionTenant`
 * service (task 19) that hard-wires the Pastel menu preset
 * (`src/presets/pastel-das-meninas.ts`, itself recovered from the removed
 * `010_seed_menu.sql`). Business-name, admin credentials and the Evolution
 * instance are taken from env / flags so no client-specific value is hardcoded
 * beyond the menu preset and the default business name.
 *
 * REQUIRES A LIVE STACK: a reachable PostgreSQL (with migrations applied),
 * Supabase (to create the admin auth user) and — unless disabled — the
 * Evolution API. In environments where those are unreachable, this script will
 * fail at the first external call; that is expected. The preset artifact and
 * its parsing/shape are validated independently by
 * `src/__tests__/unit/pastel-preset.test.ts`.
 *
 * Usage (from apps/backend, against a real environment):
 *   pnpm tsx --env-file=../../.env scripts/provision-pastel-das-meninas.ts \
 *     --admin-email=maria@pasteldasmeninas.com \
 *     --admin-password='S3nh@Forte' \
 *     [--admin-name="Maria"] \
 *     [--business-name="Pastel das Meninas"] \
 *     [--evolution-instance=pastel-das-meninas] \
 *     [--provisioning-key=pastel-das-meninas-001] \
 *     [--logo-url=https://...]
 *
 * Any flag may also be supplied via the corresponding TENANT_* env var.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 7.
 * Requirements: 9.6.
 */

import { fileURLToPath } from 'node:url';
import {
  provisionTenant,
  ProvisioningValidationError,
  ProvisioningError,
  type ProvisionTenantInput,
} from '../src/services/tenant-provision.service.js';
import { pastelDasMeninasPreset } from '../src/presets/pastel-das-meninas.js';

/** Parses `--flag=value` and `--flag value` styles from argv. */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

function readArg(
  args: Record<string, string>,
  flag: string,
  envVar: string,
): string | undefined {
  return args[flag] ?? process.env[envVar];
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);

  const input: ProvisionTenantInput = {
    provisioningKey:
      readArg(args, 'provisioning-key', 'TENANT_PROVISIONING_KEY') ?? 'pastel-das-meninas-001',
    businessName:
      readArg(args, 'business-name', 'TENANT_BUSINESS_NAME') ?? 'Pastel das Meninas',
    logoUrl: readArg(args, 'logo-url', 'TENANT_LOGO_URL') ?? null,
    theme: null,
    timezone: readArg(args, 'timezone', 'TENANT_TIMEZONE') ?? 'America/Sao_Paulo',
    evolutionInstanceName:
      readArg(args, 'evolution-instance', 'TENANT_EVOLUTION_INSTANCE') ?? 'pastel-das-meninas',
    admin: {
      name: readArg(args, 'admin-name', 'TENANT_ADMIN_NAME') ?? 'Administrador',
      email: readArg(args, 'admin-email', 'TENANT_ADMIN_EMAIL') ?? '',
      password: readArg(args, 'admin-password', 'TENANT_ADMIN_PASSWORD') ?? '',
    },
    menuPreset: pastelDasMeninasPreset,
  };

  try {
    const result = await provisionTenant(input);
    if (result.idempotentHit) {
      console.log(
        `[provision-pastel] Tenant já existia (idempotente): ${result.tenantId}`,
      );
    } else {
      console.log(
        `[provision-pastel] "Pastel das Meninas" provisionada com sucesso: ${result.tenantId}`,
      );
    }
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    if (err instanceof ProvisioningValidationError) {
      console.error(
        `[provision-pastel] Entrada inválida. Campos: ${err.fields.join(', ')}`,
      );
      return 2;
    }
    if (err instanceof ProvisioningError) {
      console.error(`[provision-pastel] Falha no provisionamento (revertido): ${err.message}`);
      return 1;
    }
    console.error('[provision-pastel] Erro inesperado:', err);
    return 1;
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  (process.argv[1].includes('provision-pastel-das-meninas') ||
    fileURLToPath(import.meta.url) === process.argv[1]);

if (isMainModule) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[provision-pastel] Erro fatal:', err);
      process.exit(1);
    });
}
