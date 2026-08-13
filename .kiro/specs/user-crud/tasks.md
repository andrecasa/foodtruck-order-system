# Implementation Plan: User CRUD

## Overview

Implementação do módulo completo de CRUD de usuários para o sistema de pedidos. A abordagem é incremental: primeiro a infraestrutura (migração, validação, middleware), depois a camada de serviço com lógica de negócio, seguida pelo controller e rotas, e por fim integração e testes. Cada etapa valida o progresso antes de avançar.

## Tasks

- [x] 1. Migração de banco e schemas de validação
  - [x] 1.1 Criar migração `011_evolve_users_for_crud.sql`
    - Adicionar colunas `name`, `status`, `updated_at` à tabela `users`
    - Alterar constraint de role para incluir `admin`
    - Remover coluna `encrypted_password`
    - Criar índice único case-insensitive em email e índice composto role+status
    - _Requirements: 1.1, 1.2, 2.4, 2.5, 3.1_

  - [x] 1.2 Criar schemas de validação Zod em `src/validation/user.validation.ts`
    - Implementar `createUserSchema`, `updateUserSchema`, `resetPasswordSchema`, `toggleStatusSchema`
    - Validar nome (1–100 chars, sem espaços somente), email (RFC 5322, ≤254), senha (8–72), role (enum)
    - `updateUserSchema` com refine para exigir ao menos um campo
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.9, 3.1, 3.8, 3.9, 7.1, 7.2_

- [x] 2. Middleware de role e tipos compartilhados
  - [x] 2.1 Criar middleware `src/middleware/role.middleware.ts`
    - Exportar interface `AuthenticatedUserWithRole` e `AdminRequest`
    - Implementar `adminMiddleware` que consulta role e status no banco a cada requisição
    - Rejeitar com 401 se usuário não existir no banco (token válido mas user excluído)
    - Rejeitar com 403 se status `inativo` ou role diferente de `admin`
    - Enriquecer `req.user` com `role`
    - _Requirements: 4.3, 6.1, 6.2, 6.3_

- [x] 3. Camada de serviço
  - [x] 3.1 Criar `src/services/user.service.ts` com funções `createUser` e `listUsers`
    - `createUser`: criar no Supabase Auth primeiro, persistir no banco local, rollback manual se falha
    - Verificar unicidade de email case-insensitive antes de criar
    - `listUsers`: consultar com filtros opcionais (role, status), ordenação alfabética case-insensitive por nome
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.2, 2.4, 2.5_

  - [x] 3.2 Implementar `getUserById`, `updateUser` e `resetPassword` no service
    - `getUserById`: consulta simples por UUID
    - `updateUser`: validar unicidade de email, contar admins ativos se alterando role, atualizar Supabase Auth se email alterado com rollback
    - `resetPassword`: atualizar senha via Supabase Admin API e invalidar sessões
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 7.1, 7.4_

  - [x] 3.3 Implementar `deactivateUser`, `activateUser` e `deleteUser` no service
    - `deactivateUser`: verificar se não é último admin, impedir auto-desativação, invalidar sessão no Supabase Auth
    - `activateUser`: alterar status para ativo
    - `deleteUser`: verificar pedidos associados, impedir auto-exclusão, remover de ambos Supabase Auth e tabela local com rollback
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.8, 5.1, 5.2, 5.5, 5.6, 5.7_

- [x] 4. Controller e rotas
  - [x] 4.1 Criar `src/controllers/user.controller.ts`
    - Implementar handlers: `createUser`, `listUsers`, `getUserById`, `updateUser`, `toggleUserStatus`, `deleteUser`, `resetPassword`
    - Extrair e validar input com Zod schemas, mapear erros Zod para formato de resposta padronizado
    - Chamar service e retornar respostas HTTP adequadas (201, 200, 422, 409, 404, etc.)
    - _Requirements: 1.1, 1.8, 1.9, 2.1, 3.1, 4.1, 5.1, 7.1_

  - [x] 4.2 Criar `src/routes/user.routes.ts` e registrar no `src/index.ts`
    - Definir rotas: POST /api/users, GET /api/users, GET /api/users/:id, PUT /api/users/:id, PATCH /api/users/:id/status, DELETE /api/users/:id, PATCH /api/users/:id/password
    - Aplicar `authMiddleware` + `adminMiddleware` em todas as rotas
    - Adicionar `app.use('/api/users', userRoutes)` no index.ts
    - _Requirements: 1.8, 6.1, 6.2_

- [x] 5. Checkpoint - Verificar compilação e estrutura
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Testes de propriedade - Criação e validação
  - [x]* 6.1 Criar `src/__tests__/properties/user-creation.property.test.ts` - Property 1
    - **Property 1: Criação preserva dados de entrada e define status ativo**
    - Gerar nomes, emails, senhas e roles válidos com fast-check e verificar que o serviço retorna os mesmos dados com status 'ativo'
    - **Validates: Requirements 1.1**

  - [x]* 6.2 Criar teste de propriedade para unicidade de email - Property 2
    - **Property 2: Unicidade de e-mail case-insensitive**
    - Gerar pares de emails que diferem apenas em capitalização e verificar rejeição na segunda tentativa
    - **Validates: Requirements 1.2, 3.2**

  - [x]* 6.3 Criar teste de propriedade para nomes com espaços - Property 3
    - **Property 3: Nomes compostos apenas por espaços são rejeitados**
    - Gerar strings compostas exclusivamente por whitespace e verificar que validação rejeita
    - **Validates: Requirements 1.6, 3.8**

  - [x]* 6.4 Criar teste de propriedade para campos obrigatórios - Property 5
    - **Property 5: Campos obrigatórios ausentes são identificados na rejeição**
    - Gerar subconjuntos de campos obrigatórios omitidos e verificar que a resposta de erro lista os campos faltantes
    - **Validates: Requirements 1.9**

- [x] 7. Testes de propriedade - Listagem e filtros
  - [x]* 7.1 Criar `src/__tests__/properties/user-listing.property.test.ts` - Property 6
    - **Property 6: Listagem retorna todos os usuários com campos obrigatórios**
    - Gerar conjuntos de usuários e verificar que todos aparecem na listagem com campos completos
    - **Validates: Requirements 2.1**

  - [x]* 7.2 Criar teste de propriedade para ordenação - Property 7
    - **Property 7: Listagem ordenada alfabeticamente por nome (case-insensitive)**
    - Gerar nomes com capitalização mista e verificar que a listagem está ordenada corretamente
    - **Validates: Requirements 2.2**

  - [x]* 7.3 Criar teste de propriedade para filtro por role - Property 8
    - **Property 8: Filtro por role retorna apenas usuários correspondentes**
    - Gerar conjunto de usuários com roles diversas, filtrar por uma role e verificar que só retorna os correspondentes
    - **Validates: Requirements 2.4**

  - [x]* 7.4 Criar teste de propriedade para filtro por status - Property 9
    - **Property 9: Filtro por status retorna apenas usuários correspondentes**
    - Gerar conjunto com status variados, filtrar e verificar correspondência exata
    - **Validates: Requirements 2.5**

- [x] 8. Testes de propriedade - Edição e acesso
  - [x]* 8.1 Criar `src/__tests__/properties/user-update.property.test.ts` - Property 10
    - **Property 10: Atualização modifica apenas os campos fornecidos**
    - Gerar subconjuntos de campos de atualização e verificar que apenas eles mudam no registro
    - **Validates: Requirements 3.1**

  - [x]* 8.2 Criar teste de propriedade para invariante de admin - Property 11
    - **Property 11: Invariante de pelo menos um admin ativo**
    - Gerar cenários onde operação resultaria em zero admins ativos e verificar rejeição
    - **Validates: Requirements 3.5, 4.4, 5.2**

  - [x]* 8.3 Criar `src/__tests__/properties/user-access.property.test.ts` - Property 4
    - **Property 4: Usuários não-admin são bloqueados em endpoints de gestão**
    - Gerar combinações de roles não-admin e endpoints e verificar HTTP 403
    - **Validates: Requirements 1.8, 6.1**

- [x] 9. Testes de propriedade - Status, exclusão e senha
  - [x]* 9.1 Criar `src/__tests__/properties/user-status.property.test.ts` - Property 12
    - **Property 12: Round-trip desativação/reativação restaura status ativo**
    - Gerar usuários ativos, desativar e reativar, verificar que status volta a ativo
    - **Validates: Requirements 4.1, 4.2**

  - [x]* 9.2 Criar teste de propriedade para bloqueio de inativo - Property 13
    - **Property 13: Usuário inativo não pode autenticar**
    - Gerar usuários inativos e verificar que middleware rejeita com 403
    - **Validates: Requirements 4.3**

  - [x]* 9.3 Criar `src/__tests__/properties/user-deletion.property.test.ts` - Property 14
    - **Property 14: Exclusão remove usuário completamente**
    - Gerar usuários sem pedidos, excluir e verificar remoção de ambas as fontes de dados
    - **Validates: Requirements 5.1**

  - [x]* 9.4 Criar teste de propriedade para proteção de exclusão - Property 15
    - **Property 15: Usuários com pedidos não podem ser excluídos**
    - Gerar usuários com pedidos associados e verificar rejeição com HTTP 422
    - **Validates: Requirements 5.5**

  - [x]* 9.5 Criar `src/__tests__/properties/user-password.property.test.ts` - Property 16
    - **Property 16: Reset de senha aceita qualquer senha de comprimento válido**
    - Gerar strings de 8–72 caracteres e verificar que reset é processado com sucesso
    - **Validates: Requirements 7.1**

- [x] 10. Testes unitários do controller e middleware
  - [x]* 10.1 Criar `src/__tests__/unit/user-controller.test.ts`
    - Testar edge cases: rollback Supabase Auth em falha de DB, 404 para user inexistente, 409 para email duplicado
    - Testar formato de resposta de erro padronizado, auto-exclusão, auto-desativação
    - Mockar service layer e validar mapeamento de erros para status HTTP corretos
    - _Requirements: 1.7, 3.4, 3.7, 4.7, 4.8, 5.3, 5.6, 5.7, 7.3, 7.4_

  - [x]* 10.2 Criar `src/__tests__/unit/role-middleware.test.ts`
    - Testar middleware com user admin (passa), atendente (403), preparador (403)
    - Testar user não encontrado no banco (401), user inativo (403)
    - Mockar pool.query e verificar comportamento
    - _Requirements: 6.1, 6.2, 6.3_

  - [x]* 10.3 Criar `src/__tests__/unit/user-validation.test.ts`
    - Testar schemas Zod com valores limítrofes: nome com 1 char, 100 chars, 101 chars
    - Email no limite (254 chars), senha 7/8/72/73 chars, body vazio no update
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.9, 3.8, 3.9, 7.2_

- [x] 11. Checkpoint final backend - Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend Mobile — API Service e tipos
  - [x] 12.1 Criar `apps/mobile/src/services/userService.ts`
    - Implementar funções: `listUsers(filters?)`, `getUserById(id)`, `createUser(data)`, `updateUser(id, data)`, `toggleUserStatus(id, status)`, `deleteUser(id)`, `resetPassword(id, password)`
    - Usar o mesmo padrão de `apiClient` já existente no mobile
    - Tipar respostas com interfaces `UserResponse`, `ListUsersResponse`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 7.1_

  - [x] 12.2 Criar `apps/mobile/src/types/user.ts`
    - Exportar interfaces: `User`, `CreateUserInput`, `UpdateUserInput`, `UserFilters`
    - Enum/union para `UserRole = 'admin' | 'atendente' | 'preparador'`
    - Enum/union para `UserStatus = 'ativo' | 'inativo'`

- [x] 13. Frontend Mobile — Tela de Listagem (Gestão de Usuários)
  - [x] 13.1 Criar `apps/mobile/src/screens/UsersListScreen.tsx`
    - **Layout (pixel-perfect — fonte: Penpot "Gestão de Usuários")**:
      - Screen: `backgroundColor: '#FDF8F4'`, flex column
      - AppBar: height 56, bg `#FFFFFF`, flex row, paddingHorizontal 16, gap 12, alignItems center
        - Back icon: Material Symbols `arrow_back` 24px, color `#8B6B5A`
        - Title: Inter 18/400, color `#3D2020`, text "Usuários"
      - Content: flex column, gap 12, paddingHorizontal 16, paddingVertical 16, flex 1
      - Filter Row: flex row, gap 8, alignItems center
        - Chips seguem o padrão FilterChips do steering `penpot-to-code.md`:
          - Ativo: height 32, borderRadius 16, paddingHorizontal 12, bg `<roleColor>@12%`, text color `<roleColor>`, fontSize 12, fontWeight 400
          - Inativo: height 32, borderRadius 16, paddingHorizontal 12, bg `#FFFFFF`, border 1px `#E8DDD5`, text color `<roleColor>`, fontSize 12, fontWeight 400
          - Cores por role: admin=`#7B2D2D`, atendente=`#5B8BA8`, preparador=`#5A8C5A`, todos=`#7B2D2D`
      - User Item Card: bg `#FFFFFF`, borderRadius 12, border 1px `#E8DDD5`, height ~75, flexDirection row, alignItems center, justifyContent space-between, paddingHorizontal 16
        - Info (left): flex column, gap 2
          - Nome: Inter 14/500, color `#3D2020`
          - Email: Inter 12/400, color `#8B6B5A`
        - Meta (right): flex column, gap 4, alignItems flex-end
          - Badge role: borderRadius 10, paddingHorizontal 8, height ~20, fontSize 8, fontWeight 500, color `#FFFFFF`
            - admin bg: `#7B2D2D`, atendente bg: `#2D5A7B`, preparador bg: `#5A7B2D`
          - Status: Inter 10/400, ativo=`#2D7B5A` text "● Ativo", inativo=`#8B6B5A` text "○ Inativo"
      - Button Novo Usuário: mesmo padrão do Button Novo Item — fill width, height 44, borderRadius 22, bg `#FFFFFF`, border 1px `#E8DDD5`, flex row center, gap 6
        - "+": Inter 16/400 `#3D2020`
        - "Novo Usuário": Inter 14/400 `#3D2020`
    - Ao tocar em um usuário → navegar para `UserDetailScreen`
    - Ao tocar "Novo Usuário" → navegar para `UserFormScreen` (modo criação)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.4, 6.5_

- [x] 14. Frontend Mobile — Tela de Formulário (Novo/Editar Usuário)
  - [x] 14.1 Criar `apps/mobile/src/screens/UserFormScreen.tsx`
    - **Layout (pixel-perfect — fonte: Penpot "Novo Usuário")**:
      - AppBar: height 56, bg `#FFFFFF`, flex row, paddingHorizontal 16, gap 12, alignItems center
        - Back icon: Material Symbols `arrow_back` 24px, color `#8B6B5A`
        - Title: Inter 18/400, color `#3D2020`, text "Novo Usuário" ou "Editar Usuário"
      - Content: flex column, gap 20, paddingHorizontal 16, paddingVertical 24
      - Labeled Input Field (padrão "Novo Item Cardápio"):
        - Container: flex column, gap 8, width fill
        - Label: Inter 12/400, color `#3D2020`
        - Input: bg `#F5F5F5`, borderRadius 24, height 48, paddingHorizontal 16, flex row, alignItems center, gap 10, SEM stroke
        - Placeholder: Inter 14/400, color `#8B6B5A` opacity 0.6
        - Value (preenchido): Inter 14/400, color `#3D2020`
      - Campos:
        - "Nome" → placeholder "Nome completo do usuário"
        - "E-mail" → placeholder "usuario@email.com"
        - "Senha" → placeholder "Mínimo 8 caracteres" (icon `visibility` 20px `#8B6B5A` no end)
        - "Confirmar Senha" → placeholder "Mínimo 8 caracteres" (icon `visibility`)
        - "Função" → Select: mesma aparência do input + Spacer(flex 1) + icon `expand_more` 20px `#8B6B5A`
          - Value quando vazio: "Selecione..." Inter 14/400 `#8B6B5A` opacity 0.6
      - Confirm Button: fill width, height 44, borderRadius 22, bg `#7B2D2D`, text Inter 14/400 `#FFFFFF` center
        - Criação: "Criar Usuário" | Edição: "Editar Usuário"
      - Cancel Button: fill width, height 44, borderRadius 22, bg `#FFFFFF`, border 1px `#E8DDD5`, text Inter 14/400 `#3D2020` center "Cancelar"
    - Modo criação: todos os campos vazios, botão "Criar Usuário"
    - Modo edição: campos preenchidos (sem senha), botão "Editar Usuário"
    - Validação inline antes de submeter (mesmas regras do backend)
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.9, 3.1, 3.8, 3.9_

- [x] 15. Frontend Mobile — Tela de Detalhe (Editar Usuário com ações)
  - [x] 15.1 Criar `apps/mobile/src/screens/UserDetailScreen.tsx`
    - **Layout (pixel-perfect — fonte: Penpot "Editar Usuário")**:
      - AppBar: height 56, bg `#FFFFFF`, "Editar Usuário"
      - Content: flex column, gap 20, paddingHorizontal 16, paddingVertical 24
      - User Info Card (topo): bg `#FFFFFF`, borderRadius 12, border 1px `#E8DDD5`, padding 16, flex column, gap 12
        - Row: badge role + nome Inter 14/500 `#3D2020`
        - Email: Inter 12/400 `#8B6B5A`
      - Form fields (mesmo padrão task 14): Função, Nome, Senha, Confirmar Senha
      - Confirm Button: "Editar Usuário"
      - Cancel Button: "Cancelar"
      - Action Danger Button (Excluir): fill width, height 48, borderRadius 12, bg `#FFFFFF`, border 1px `#C0392B`, flex row, gap 12, alignItems center, paddingHorizontal 16
        - Icon: Material Symbols `delete` 20px, color `#C0392B`
        - Text: Inter 14/400, color `#C0392B`, "Excluir usuário"
    - Ao tocar "Excluir" → Diálogo de confirmação (padrão Dialog/Danger do Design System)
    - _Requirements: 3.1, 4.1, 4.2, 4.8, 5.1, 5.4, 5.7, 7.1, 7.5, 7.6_

- [x] 16. Frontend Mobile — Navegação e controle de acesso
  - [x] 16.1 Integrar telas no navigation stack
    - Registrar rotas: `UsersList`, `UserForm`, `UserDetail`
    - Acessível via Drawer Menu (novo item "Usuários" com icon `group` 22px, apenas para role admin)
    - Se role != admin e tentar acessar rota diretamente → redirect para tela de Pedidos
    - _Requirements: 6.4, 6.5_

- [x] 17. Frontend Mobile — Mock para Modo Protótipo
  - [x] 17.1 Criar mock de dados de usuários em `apps/mobile/src/mocks/users.mock.ts`
    - 4 usuários mock (mesmo do Penpot): André Silva (admin/ativo), Maria Santos (atendente/ativo), João Oliveira (preparador/ativo), Carlos Lima (atendente/inativo)
    - Mock de todas as operações CRUD (simular resposta de sucesso e atualizar estado local)
    - Condicionar com `PROTOTYPE_MODE` (mesmo padrão dos outros mocks do sistema)

- [x] 18. Checkpoint final mobile - Verificar build e navegação
  - Rodar `tsc --noEmit` no app mobile
  - Verificar que todas as telas renderizam no Modo Protótipo
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes de propriedade validam propriedades universais de corretude (16 propriedades definidas no design)
- Testes unitários validam exemplos específicos, edge cases e cenários de erro com mocks
- A migração deve ser executada antes de qualquer outro código (`npm run migrate`)
- O projeto já possui `fast-check` v4.9+ e `vitest` configurados

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.4", "7.1", "7.2", "7.3", "7.4", "8.1", "8.2", "8.3", "9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 8, "tasks": ["12.1", "12.2"] },
    { "id": 9, "tasks": ["13.1", "14.1", "15.1", "17.1"] },
    { "id": 10, "tasks": ["16.1"] }
  ]
}
```
