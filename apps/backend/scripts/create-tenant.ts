/**
 * CLI onboarding script — provisions a new tenant without a code change or
 * redeploy (R9.1, R9.5).
 *
 * It reads the provisioning input from CLI flags and/or environment variables,
 * calls the platform-level `provisionTenant` service (transactional: validates
 * input, is idempotent by `provisioning_key`, and rolls back fully on failure —
 * R9.7–R9.9), and prints the result.
 *
 * Usage (from apps/backend):
 *   pnpm tsx --env-file=../../.env scripts/create-tenant.ts \
 *     --provisioning-key=pastel-das-meninas \
 *     --business-name="Pastel das Meninas" \
 *     --evolution-instance=pastel-das-meninas \
 *     --admin-name="Maria" \
 *     --admin-email=maria@pastel.com \
 *     --admin-password='S3nh@Forte' \
 *     [--logo-url=https://...] \
 *     [--timezone=America/Sao_Paulo] \
 *     [--menu-preset=./preset.json] \
 *     [--theme=./theme.json]
 *
 * Any flag may instead be supplied via env var (see `readArg`). A `--menu-preset`
 * JSON file (an `OnboardingPreset`) is required unless `TENANT_MENU_PRESET` is
 * set; a minimal single-category fallback is used only when neither is given.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 7.
 * Requirements: 9.1, 9.5.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  provisionTenant,
  ProvisioningValidationError,
  ProvisioningError,
  type ProvisionTenantInput,
  type OnboardingPreset,
} from '../src/services/tenant-provision.service.js';
import type { ThemeConfig } from '@order-system/shared';

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

/** Reads a value from CLI flags first, then the environment. */
function readArg(
  args: Record<string, string>,
  flag: string,
  envVar: string,
): string | undefined {
  return args[flag] ?? process.env[envVar];
}

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as T;
}

const DEFAULT_MENU_PRESET: OnboardingPreset = {
  categories: [
    { name: 'Geral', sortOrder: 0, items: [{ name: 'Item inicial', priceCents: 1000 }] },
  ],
};

async function resolveMenuPreset(
  args: Record<string, string>,
): Promise<OnboardingPreset> {
  const presetPath = readArg(args, 'menu-preset', 'TENANT_MENU_PRESET');
  if (!presetPath) return DEFAULT_MENU_PRESET;
  // If the value looks like inline JSON, parse it directly; else treat as a path.
  if (presetPath.trim().startsWith('{')) {
    return JSON.parse(presetPath) as OnboardingPreset;
  }
  return readJsonFile<OnboardingPreset>(presetPath);
}

async function resolveTheme(
  args: Record<string, string>,
): Promise<Partial<ThemeConfig> | undefined> {
  const themeArg = readArg(args, 'theme', 'TENANT_THEME');
  if (!themeArg) return undefined;
  if (themeArg.trim().startsWith('{')) {
    return JSON.parse(themeArg) as Partial<ThemeConfig>;
  }
  return readJsonFile<Partial<ThemeConfig>>(themeArg);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);

  const input: ProvisionTenantInput = {
    provisioningKey: readArg(args, 'provisioning-key', 'TENANT_PROVISIONING_KEY') ?? '',
    businessName: readArg(args, 'business-name', 'TENANT_BUSINESS_NAME') ?? '',
    logoUrl: readArg(args, 'logo-url', 'TENANT_LOGO_URL') ?? null,
    theme: (await resolveTheme(args)) ?? null,
    timezone: readArg(args, 'timezone', 'TENANT_TIMEZONE'),
    evolutionInstanceName: readArg(args, 'evolution-instance', 'TENANT_EVOLUTION_INSTANCE') ?? '',
    admin: {
      name: readArg(args, 'admin-name', 'TENANT_ADMIN_NAME') ?? '',
      email: readArg(args, 'admin-email', 'TENANT_ADMIN_EMAIL') ?? '',
      password: readArg(args, 'admin-password', 'TENANT_ADMIN_PASSWORD') ?? '',
    },
    menuPreset: await resolveMenuPreset(args),
  };

  try {
    const result = await provisionTenant(input);
    if (result.idempotentHit) {
      console.log(
        `[create-tenant] Tenant já existia para esta provisioning_key (idempotente): ${result.tenantId}`,
      );
    } else {
      console.log(`[create-tenant] Tenant provisionado com sucesso: ${result.tenantId}`);
    }
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    if (err instanceof ProvisioningValidationError) {
      console.error(
        `[create-tenant] Entrada inválida. Campos: ${err.fields.join(', ')}`,
      );
      return 2;
    }
    if (err instanceof ProvisioningError) {
      console.error(`[create-tenant] Falha no provisionamento (revertido): ${err.message}`);
      return 1;
    }
    console.error('[create-tenant] Erro inesperado:', err);
    return 1;
  }
}

// Run directly via: tsx scripts/create-tenant.ts ...
const isMainModule =
  process.argv[1] !== undefined &&
  (process.argv[1].includes('create-tenant') ||
    fileURLToPath(import.meta.url) === process.argv[1]);

if (isMainModule) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[create-tenant] Erro fatal:', err);
      process.exit(1);
    });
}
