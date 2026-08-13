# Documento de Requisitos do Bugfix

## Introdução

Ao acessar rotas protegidas (ex: GET /api/users), o backend retorna 401 "Sessão inválida" mesmo com um token JWT válido do Supabase Auth. Isso ocorre porque o `adminMiddleware` consulta a tabela `users` pelo ID do Supabase Auth, mas essa tabela não possui um registro correspondente — os IDs eram gerados automaticamente por `gen_random_uuid()` e nunca foram vinculados ao Supabase Auth. Qualquer usuário autenticado pelo Supabase Auth que não tenha uma linha na tabela `users` fica impossibilitado de acessar o sistema.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN um usuário se autentica com sucesso via Supabase Auth (token JWT válido) E não existe um registro na tabela `users` com `id` igual ao UID do Supabase Auth THEN o sistema retorna 401 com mensagem "Sessão inválida. Faça login novamente."

1.2 WHEN o primeiro administrador tenta acessar o sistema após a migração para Supabase Auth THEN o sistema retorna 401, pois não há mecanismo de criação/sincronização da linha na tabela `users` com o UID do Supabase Auth

### Expected Behavior (Correct)

2.1 WHEN um usuário se autentica com sucesso via Supabase Auth E não existe um registro na tabela `users` com `id` igual ao UID do Supabase Auth THEN o sistema SHALL criar automaticamente um registro na tabela `users` com o UID do Supabase Auth, o email do token e dados padrão, permitindo a continuidade do fluxo de autorização

2.2 WHEN o primeiro usuário do sistema se autentica via Supabase Auth E a tabela `users` está vazia (nenhum admin existe) THEN o sistema SHALL atribuir a role `admin` ao registro criado automaticamente, garantindo que ao menos um administrador exista

### Unchanged Behavior (Regression Prevention)

3.1 WHEN um usuário autenticado via Supabase Auth já possui um registro na tabela `users` com o mesmo UID THEN o sistema SHALL CONTINUE TO consultar o registro existente e aplicar as regras de role/status normalmente sem duplicar ou sobrescrever dados

3.2 WHEN um token JWT é inválido ou expirado THEN o sistema SHALL CONTINUE TO retornar 401 "Token inválido ou expirado" no `authMiddleware` antes de chegar ao `adminMiddleware`

3.3 WHEN um usuário existente na tabela `users` tem status `inativo` THEN o sistema SHALL CONTINUE TO retornar 403 "Usuário desativado. Contate o administrador."

3.4 WHEN um usuário existente na tabela `users` tem role diferente de `admin` THEN o sistema SHALL CONTINUE TO retornar 403 "Acesso restrito a administradores." nas rotas protegidas por `adminMiddleware`
