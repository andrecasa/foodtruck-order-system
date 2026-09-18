/**
 * CLI de exclusão TOTAL de um tenant, para limpeza de tenants de teste.
 *
 * ⚠️ Operação destrutiva e irreversível. Remove, para o tenant identificado por
 * `--slug` (= `provisioning_key`):
 *   1. Banco (Postgres), em transação e na ordem que respeita as FKs
 *      `ON DELETE RESTRICT`: order_items → orders → password_reset_codes →
 *      menu_items → categories → daily_sequences → whatsapp_sessions → users →
 *      tenants. Nada cai em cascata a partir de `tenants` (por isso a ordem).
 *   2. Supabase Auth: `deleteUser` para cada `users.id` do tenant (o id da linha
 *      em `users` é o id do usuário no Auth).
 *   3. Evolution API: exclui a instância `tenants.evolution_instance_name`.
 *   4. S3: apaga a logo (`tenant-assets/{slug}/logo.{ext}`), se houver `logo_url`.
 *
 * Segurança:
 *   - `--dry-run`: apenas mostra o que seria removido (contagens + recursos), sem
 *     apagar nada.
 *   - Sem `--dry-run`, pede confirmação interativa digitando o slug (a menos que
 *     `--yes` seja passado, para uso não interativo/CI).
 *   - Os recursos externos (Auth/Evolution/S3) são best-effort: uma falha ali é
 *     reportada como aviso e NÃO reverte a exclusão do banco (que já foi
 *     commitada). O banco é a fonte da verdade da existência do tenant.
 *
 * Uso (a partir de apps/backend):
 *   pnpm tsx --env-file=../../.env scripts/delete-tenant.ts --slug=meu-tenant --dry-run
 *   pnpm tsx --env-file=../../.env scripts/delete-tenant.ts --slug=meu-tenant
 *   pnpm tsx --env-file=../../.env scripts/delete-tenant.ts --slug=meu-tenant --yes
 *
 * Requer no `.env` da raiz: DATABASE_URL (ou POSTGRES_*), SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_API_URL + EVOLUTION_API_KEY e, para a
 * logo, ASSETS_S3_BUCKET (+ AWS_REGION).
 */

import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PoolClient } from 'pg';
import { pool } from '../src/config/database.js';
import { supabaseAdmin } from '../src/config/supabase.js';
import { deleteEvolutionInstance } from '../src/bot/evolution-api.client.js';

/**
 * Tabelas tenant-scoped na ordem de exclusão (filhas antes das pais), de modo a
 * respeitar as FKs `ON DELETE RESTRICT`. `tenants` é apagada por último, à parte.
 */
const TENANT_SCOPED_TABLES = [
  'order_items',
  'orders',
  'password_reset_codes',
  'menu_items',
  'categories',
  'daily_sequences',
  'whatsapp_sessions',
  'users',
] as const;

/** Região padrão do bucket de assets (espelha `s3-logo-upload.ts`). */
const DEFAULT_AWS_REGION = 'us-east-1';

interface TenantRow {
  id: string;
  business_name: string;
  provisioning_key: string | null;
  evolution_instance_name: string | null;
  logo_url: string | null;
}

/** Parseia `--flag=value` e `--flag value` (mesmo estilo do create-tenant). */
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

/** Conta as linhas de cada tabela tenant-scoped para o resumo. */
async function countRows(client: PoolClient, tenantId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TENANT_SCOPED_TABLES) {
    const res = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id = $1`,
      [tenantId],
    );
    counts[table] = res.rows[0].n as number;
  }
  return counts;
}

/** Ids dos usuários do tenant (usados para remover do Supabase Auth). */
async function getUserIds(client: PoolClient, tenantId: string): Promise<string[]> {
  const res = await client.query(`SELECT id FROM users WHERE tenant_id = $1`, [tenantId]);
  return res.rows.map((r) => r.id as string);
}

/**
 * Deriva a `Logo_Object_Key` (`tenant-assets/{slug}/logo.{ext}`) a partir da
 * `logo_url`. Retorna `null` quando não há logo ou a URL não casa o padrão.
 */
function logoObjectKeyFromUrl(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  const match = logoUrl.match(/tenant-assets\/[^/]+\/logo\.[a-z0-9]+$/i);
  return match ? match[0] : null;
}

/** Apaga todas as linhas tenant-scoped e o próprio tenant, em transação. */
async function deleteFromDatabase(client: PoolClient, tenantId: string): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const table of TENANT_SCOPED_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    }
    await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/** Remove cada usuário do Supabase Auth (best-effort; agrega falhas). */
async function deleteAuthUsers(userIds: string[]): Promise<string[]> {
  const failures: string[] = [];
  for (const id of userIds) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (error) failures.push(`${id}: ${error.message}`);
    } catch (err) {
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures;
}

/** Apaga o objeto de logo no S3 (best-effort). Retorna aviso ou `null`. */
async function deleteLogo(objectKey: string): Promise<string | null> {
  const bucket = process.env.ASSETS_S3_BUCKET?.trim();
  if (!bucket) {
    return 'ASSETS_S3_BUCKET não definido — logo no S3 não removida.';
  }
  const region = process.env.AWS_REGION?.trim() || DEFAULT_AWS_REGION;
  try {
    const client = new S3Client({ region });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    return null;
  } catch (err) {
    return `Falha ao remover logo do S3 (${objectKey}): ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const slug = args['slug'];
  const dryRun = args['dry-run'] === 'true';
  const skipConfirm = args['yes'] === 'true';

  if (!slug) {
    console.error('[delete-tenant] Faltou --slug=<provisioning_key>.');
    return 2;
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query<TenantRow>(
      `SELECT id, business_name, provisioning_key, evolution_instance_name, logo_url
         FROM tenants WHERE provisioning_key = $1`,
      [slug],
    );
    const tenant = tenantRes.rows[0];
    if (!tenant) {
      console.error(`[delete-tenant] Nenhum tenant com provisioning_key="${slug}".`);
      return 1;
    }

    const counts = await countRows(client, tenant.id);
    const userIds = await getUserIds(client, tenant.id);
    const logoKey = logoObjectKeyFromUrl(tenant.logo_url);

    // Resumo do que será removido.
    console.log('\n=== Tenant a excluir ===');
    console.log(`  id:               ${tenant.id}`);
    console.log(`  business_name:    ${tenant.business_name}`);
    console.log(`  provisioning_key: ${tenant.provisioning_key}`);
    console.log(`  evolution:        ${tenant.evolution_instance_name ?? '—'}`);
    console.log(`  logo (S3):        ${logoKey ?? '—'}`);
    console.log('  linhas por tabela:');
    for (const table of TENANT_SCOPED_TABLES) {
      console.log(`    - ${table}: ${counts[table]}`);
    }
    console.log(`  usuários no Auth: ${userIds.length}`);
    console.log('========================\n');

    if (dryRun) {
      console.log('[delete-tenant] --dry-run: nada foi removido.');
      return 0;
    }

    // Confirmação interativa (a menos que --yes).
    if (!skipConfirm) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(
        `Isso é IRREVERSÍVEL. Digite o slug "${slug}" para confirmar: `,
      );
      rl.close();
      if (answer.trim() !== slug) {
        console.error('[delete-tenant] Confirmação não confere. Abortado.');
        return 1;
      }
    }

    // 1. Banco (transacional).
    await deleteFromDatabase(client, tenant.id);
    console.log('[delete-tenant] Banco: linhas do tenant removidas.');

    // 2. Supabase Auth (best-effort).
    const authFailures = await deleteAuthUsers(userIds);
    if (authFailures.length > 0) {
      console.warn(`[delete-tenant] Aviso: falha ao remover ${authFailures.length} usuário(s) do Auth:`);
      authFailures.forEach((f) => console.warn(`    - ${f}`));
    } else if (userIds.length > 0) {
      console.log(`[delete-tenant] Auth: ${userIds.length} usuário(s) removido(s).`);
    }

    // 3. Evolution (best-effort).
    if (tenant.evolution_instance_name) {
      try {
        const ok = await deleteEvolutionInstance(tenant.evolution_instance_name);
        console.log(
          ok
            ? `[delete-tenant] Evolution: instância "${tenant.evolution_instance_name}" removida.`
            : `[delete-tenant] Aviso: Evolution não confirmou a exclusão de "${tenant.evolution_instance_name}".`,
        );
      } catch (err) {
        console.warn(
          `[delete-tenant] Aviso: falha de rede ao remover instância Evolution: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 4. Logo no S3 (best-effort).
    if (logoKey) {
      const warn = await deleteLogo(logoKey);
      console.log(warn ? `[delete-tenant] Aviso: ${warn}` : `[delete-tenant] S3: logo removida (${logoKey}).`);
    }

    console.log(`\n[delete-tenant] Tenant "${slug}" excluído.`);
    return 0;
  } catch (err) {
    console.error('[delete-tenant] Erro ao excluir o tenant:', err);
    return 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  (process.argv[1].includes('delete-tenant') ||
    fileURLToPath(import.meta.url) === process.argv[1]);

if (isMainModule) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[delete-tenant] Erro fatal:', err);
      process.exit(1);
    });
}
