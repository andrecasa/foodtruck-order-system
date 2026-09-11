import { pool } from '../config/database.js';

/**
 * Repositório de leitura de usuários por id.
 *
 * EXCEÇÃO ARQUITETURAL (mesma dos demais repositórios em `src/db/`, como o
 * `password-reset-repository`): o fluxo de login é público e roda ANTES do
 * `tenantMiddleware`, sem `tenant_id` resolvido na request. O
 * `TenantRepository` exige um tenant por construção e não pode ser usado aqui,
 * então este repositório fala direto com o `pool` compartilhado — o mesmo
 * privilégio já concedido ao provisionamento e ao fluxo de recuperação de
 * senha. Como a busca é por `users.id` (chave global), não há vazamento entre
 * tenants: cada id pertence a exatamente um tenant.
 *
 * Toda consulta é parametrizada (`$1`).
 */

/** Papéis possíveis de um usuário na aplicação. */
export type UserRole = 'admin' | 'atendente' | 'preparador';

/**
 * Busca o papel (`role`) de um usuário pelo id. Retorna `null` quando o usuário
 * não está provisionado na tabela `users` (ex.: existe no Supabase Auth mas
 * ainda não foi vinculado a um tenant).
 */
export async function findUserRoleById(id: string): Promise<UserRole | null> {
  const result = await pool.query<{ role: UserRole }>(
    'SELECT role FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0]?.role ?? null;
}

/**
 * Dados do trial do tenant ao qual o usuário pertence, resolvidos por `users.id`.
 * `null` em todos os campos quando o tenant não expõe trial (legado).
 */
export interface UserTenantTrial {
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
}

/**
 * Resolve os dados de trial do tenant de um usuário pelo id, para o Trial_Guard
 * aplicar o bloqueio no login (R12.1), que roda ANTES do `tenantMiddleware` e,
 * portanto, sem `tenant_id` na request — daí a consulta direta ao `pool` (mesma
 * exceção arquitetural deste repositório).
 *
 * Retorna `null` quando o usuário não resolve para um tenant (não provisionado
 * ou sem `tenant_id`): nesses casos não há trial a avaliar e o login segue o
 * comportamento atual (o `tenantMiddleware` cuidará da rejeição em requisições
 * subsequentes).
 */
export async function findTenantTrialByUserId(
  id: string,
): Promise<UserTenantTrial | null> {
  const result = await pool.query<UserTenantTrial>(
    `SELECT t.trial_ends_at AS "trialEndsAt",
            t.subscription_status AS "subscriptionStatus"
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
