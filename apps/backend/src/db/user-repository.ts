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
