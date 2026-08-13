# Requirements Document

## Introduction

Módulo de gerenciamento de usuários (CRUD) para o sistema de pedidos do trailer de pastéis. O sistema atualmente suporta autenticação via Supabase Auth mas não possui funcionalidade para criar, listar, editar ou excluir usuários. Esta feature permite que administradores gerenciem os operadores do sistema (atendentes, preparadores e outros admins), garantindo controle de acesso baseado em roles e rastreabilidade das operações.

## Glossary

- **Sistema**: O conjunto completo da solução de pedidos do food truck.
- **Backend**: O serviço Node.js + Express que implementa a lógica de negócio e expõe a API REST.
- **Supabase_Auth**: O módulo de autenticação do Supabase self-hosted responsável por gerenciar credenciais e tokens de sessão.
- **Admin**: Usuário com permissão de gerenciar outros usuários do sistema (criar, listar, editar, excluir).
- **Atendente**: Funcionário responsável por registrar pedidos e receber pagamentos.
- **Preparador**: Funcionário responsável por preparar os pedidos.
- **Role**: Papel atribuído a um usuário que define suas permissões no sistema. Valores válidos: `admin`, `atendente`, `preparador`.
- **Usuário**: Registro no sistema que representa uma pessoa com acesso autenticado, composto por e-mail, nome, role e status.
- **Status_do_Usuário**: Estado que indica se o usuário pode acessar o sistema: `ativo` ou `inativo`.
- **App**: O aplicativo mobile React Native / Expo utilizado pelo atendente.
- **Tela_de_Gestão_de_Usuários**: Interface acessível apenas por usuários com Role `admin` para gerenciar os usuários do sistema.

---

## Requirements

### Requirement 1: Criação de Usuário

**User Story:** Como admin, quero criar novos usuários no sistema informando nome, e-mail, senha e role, para que novos funcionários possam acessar o sistema com as permissões adequadas.

#### Acceptance Criteria

1. WHEN o Admin submete nome (1–100 caracteres, sem espaços em branco somente), e-mail válido conforme RFC 5322 (máximo 254 caracteres, comparação case-insensitive), senha (8–72 caracteres) e role (`admin`, `atendente` ou `preparador`), THE Backend SHALL criar o usuário no Supabase_Auth e persistir o registro na tabela de usuários com Status_do_Usuário `ativo`, retornando HTTP 201 com o id, nome, e-mail, role e status do usuário criado em até 5 segundos.
2. IF o Admin submete um e-mail que já está cadastrado no sistema (comparação case-insensitive), THEN THE Backend SHALL rejeitar a requisição com HTTP 409 e mensagem indicando que já existe um usuário com o e-mail informado, sem criar registro no Supabase_Auth.
3. IF o Admin submete uma senha com menos de 8 caracteres ou mais de 72 caracteres, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que a senha deve ter entre 8 e 72 caracteres.
4. IF o Admin submete uma role diferente de `admin`, `atendente` ou `preparador`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que a role é inválida.
5. IF o Admin submete um e-mail com formato inválido ou com mais de 254 caracteres, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que o formato de e-mail é inválido.
6. IF o Admin submete um nome vazio, composto somente por espaços em branco, ou com mais de 100 caracteres, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que o nome deve ter entre 1 e 100 caracteres.
7. IF a criação do usuário no Supabase_Auth falhar por indisponibilidade ou erro interno, THEN THE Backend SHALL retornar HTTP 502 com mensagem indicando falha na criação do usuário, sem persistir registro parcial na tabela de usuários.
8. IF o requisitante não possui role `admin`, THEN THE Backend SHALL rejeitar a requisição com HTTP 403 e mensagem indicando que apenas administradores podem criar usuários.
9. IF qualquer campo obrigatório (nome, e-mail, senha ou role) estiver ausente no corpo da requisição, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando quais campos obrigatórios estão faltando.

---

### Requirement 2: Listagem de Usuários

**User Story:** Como admin, quero visualizar a lista de todos os usuários cadastrados no sistema, para que eu possa acompanhar quem tem acesso e qual função cada pessoa desempenha.

#### Acceptance Criteria

1. WHEN o Admin acessa a listagem de usuários, THE Backend SHALL retornar todos os usuários cadastrados contendo: id, nome, e-mail, role e Status_do_Usuário, em no máximo 2 segundos.
2. THE Backend SHALL ordenar a lista de usuários por nome em ordem alfabética crescente, utilizando comparação case-insensitive.
3. THE Tela_de_Gestão_de_Usuários SHALL exibir para cada usuário: nome, e-mail, role (com badge visual distinguindo `admin`, `atendente` e `preparador`) e Status_do_Usuário (com indicador visual distinguindo `ativo` e `inativo`).
4. WHEN o Admin aplica um filtro por role, THE Backend SHALL retornar apenas os usuários cuja role corresponda ao valor selecionado, mantendo quaisquer outros filtros ativos simultaneamente.
5. WHEN o Admin aplica um filtro por Status_do_Usuário, THE Backend SHALL retornar apenas os usuários cujo status corresponda ao valor selecionado, mantendo quaisquer outros filtros ativos simultaneamente.
6. IF nenhum usuário corresponder aos filtros aplicados, THEN THE Tela_de_Gestão_de_Usuários SHALL exibir uma mensagem indicando que não há usuários para os critérios selecionados.
7. IF o Backend falhar ao buscar a lista de usuários, THEN THE Tela_de_Gestão_de_Usuários SHALL exibir uma mensagem de erro indicando falha ao carregar os dados e oferecer a opção de tentar novamente.

---

### Requirement 3: Edição de Usuário

**User Story:** Como admin, quero editar os dados de um usuário existente (nome, e-mail, role), para que eu possa corrigir informações ou alterar permissões conforme necessário.

#### Acceptance Criteria

1. WHEN o Admin submete alterações de nome, e-mail ou role de um usuário existente, THE Backend SHALL atualizar os campos correspondentes no registro do usuário e, se o e-mail foi alterado, atualizar também no Supabase_Auth; o nome deve ter entre 1 e 100 caracteres e o e-mail deve ter formato válido, aplicando as mesmas regras de validação da criação de usuário.
2. IF o Admin altera o e-mail para um valor que já está cadastrado por outro usuário (comparação case-insensitive), THEN THE Backend SHALL rejeitar a requisição com HTTP 409 e a mensagem "Já existe um usuário com este e-mail".
3. IF o Admin altera a role para um valor diferente de `admin`, `atendente` ou `preparador`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Role inválida".
4. IF o Admin tenta editar um usuário que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Usuário não encontrado".
5. IF o Admin tenta remover a role `admin` do único usuário com esta role no sistema, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "O sistema deve ter ao menos um administrador".
6. WHEN o Admin altera a role de um usuário, THE Backend SHALL invalidar a sessão ativa desse usuário para que as novas permissões entrem em vigor no próximo login.
7. IF a atualização do e-mail no Supabase_Auth falhar após a validação, THEN THE Backend SHALL reverter quaisquer alterações já aplicadas no registro local do usuário e retornar HTTP 500 com a mensagem "Erro ao atualizar usuário".
8. IF o Admin submete um nome vazio ou com mais de 100 caracteres na edição, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Nome deve ter entre 1 e 100 caracteres".
9. IF o Admin submete um e-mail com formato inválido na edição, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Formato de e-mail inválido".

---

### Requirement 4: Desativação e Reativação de Usuário

**User Story:** Como admin, quero desativar usuários que não devem mais acessar o sistema sem excluí-los permanentemente, para que o histórico de operações seja preservado e o acesso possa ser restaurado futuramente.

#### Acceptance Criteria

1. WHEN o Admin desativa um usuário com Status_do_Usuário `ativo`, THE Backend SHALL alterar o Status_do_Usuário para `inativo`, invalidar a sessão ativa desse usuário no Supabase_Auth dentro da mesma requisição, e retornar HTTP 200 com os dados atualizados do usuário.
2. WHEN o Admin reativa um usuário com Status_do_Usuário `inativo`, THE Backend SHALL alterar o Status_do_Usuário para `ativo` e retornar HTTP 200 com os dados atualizados do usuário.
3. IF um usuário com Status_do_Usuário `inativo` tenta fazer login, THEN THE Backend SHALL rejeitar a autenticação com HTTP 403 e a mensagem "Usuário desativado. Contate o administrador".
4. IF o Admin tenta desativar o único usuário com role `admin` ativo no sistema, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "O sistema deve ter ao menos um administrador ativo".
5. IF o Admin tenta desativar um usuário que já está com Status_do_Usuário `inativo`, THEN THE Backend SHALL retornar HTTP 422 e a mensagem "Usuário já está inativo".
6. IF o Admin tenta reativar um usuário que já está com Status_do_Usuário `ativo`, THEN THE Backend SHALL retornar HTTP 422 e a mensagem "Usuário já está ativo".
7. IF o Admin tenta desativar ou reativar um usuário que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Usuário não encontrado".
8. IF o Admin tenta desativar a si mesmo, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Não é possível desativar o próprio usuário".

---

### Requirement 5: Exclusão de Usuário

**User Story:** Como admin, quero excluir permanentemente um usuário do sistema quando necessário, para que dados de usuários criados por engano possam ser removidos.

#### Acceptance Criteria

1. WHEN o Admin confirma a exclusão de um usuário, THE Backend SHALL remover o registro do usuário da tabela de usuários e do Supabase_Auth permanentemente, e invalidar todas as sessões ativas desse usuário.
2. IF o Admin tenta excluir um usuário com role `admin` e este é o único admin ativo no sistema, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "O sistema deve ter ao menos um administrador ativo".
3. IF o Admin tenta excluir um usuário que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Usuário não encontrado".
4. WHEN o Admin solicita a exclusão de um usuário, THE Tela_de_Gestão_de_Usuários SHALL exibir um diálogo de confirmação com o nome e e-mail do usuário, contendo um botão para confirmar e outro para cancelar; se o Admin cancelar, o sistema não deve enviar a requisição de exclusão e o registro do usuário deve permanecer inalterado.
5. IF o usuário a ser excluído possui pedidos associados no histórico (pedidos cuja criação foi atribuída ao usuário), THEN THE Backend SHALL rejeitar a exclusão com HTTP 422 e a mensagem "Usuário possui pedidos associados. Desative o usuário em vez de excluí-lo".
6. IF a remoção do registro no Supabase_Auth for bem-sucedida mas a remoção na tabela de usuários falhar (ou vice-versa), THEN THE Backend SHALL reverter a operação completa e retornar HTTP 500 com mensagem indicando erro na exclusão, garantindo que nenhum registro fique em estado parcialmente removido.
7. IF o Admin tenta excluir a si próprio, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Não é permitido excluir o próprio usuário".

---

### Requirement 6: Controle de Acesso por Role

**User Story:** Como operador do sistema, quero que apenas administradores possam gerenciar usuários, para que atendentes e preparadores não alterem configurações de acesso indevidamente.

#### Acceptance Criteria

1. IF um usuário com role `atendente` ou `preparador` tenta acessar qualquer endpoint de gestão de usuários (criar, listar, editar, desativar, reativar ou excluir), THEN THE Backend SHALL rejeitar a requisição com HTTP 403, código de erro `FORBIDDEN` e mensagem indicando que o acesso é restrito a administradores.
2. WHEN o Backend recebe uma requisição autenticada para qualquer endpoint de gestão de usuários, THE Backend SHALL consultar a role atual do usuário no banco de dados (tabela de usuários) em vez de confiar apenas nos dados do token, garantindo que alterações de role entrem em vigor na próxima requisição sem necessidade de novo login.
3. IF durante a verificação de role o registro do usuário não for encontrado no banco de dados (usuário excluído com token ainda válido), THEN THE Backend SHALL rejeitar a requisição com HTTP 401 e mensagem indicando que a sessão é inválida.
4. THE Tela_de_Gestão_de_Usuários SHALL ser renderizada apenas para usuários com role `admin`; para usuários com role `atendente` ou `preparador`, o App não SHALL renderizar o item de menu nem a rota de navegação correspondente à gestão de usuários.
5. IF um usuário autenticado com role diferente de `admin` tenta acessar a rota da Tela_de_Gestão_de_Usuários diretamente pela URL, THEN THE App SHALL redirecionar o usuário para a tela de pedidos (tela inicial padrão do App) em até 1 segundo, sem exibir qualquer conteúdo de gestão de usuários.

---

### Requirement 7: Redefinição de Senha pelo Admin

**User Story:** Como admin, quero redefinir a senha de um usuário, para que eu possa restabelecer o acesso de um funcionário que esqueceu suas credenciais sem precisar excluir e recriar o cadastro.

#### Acceptance Criteria

1. WHEN o Admin submete uma nova senha (mínimo 8 caracteres, máximo 72 caracteres) para um usuário existente com Status_do_Usuário `ativo` ou `inativo`, THE Backend SHALL atualizar a senha do usuário no Supabase_Auth e invalidar todas as sessões ativas desse usuário.
2. IF o Admin submete uma senha com menos de 8 caracteres ou mais de 72 caracteres, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "A senha deve ter entre 8 e 72 caracteres".
3. IF o Admin tenta redefinir a senha de um usuário que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Usuário não encontrado".
4. IF a atualização da senha no Supabase_Auth falhar, THEN THE Backend SHALL retornar HTTP 500 com a mensagem "Erro ao redefinir senha" sem alterar o estado das sessões do usuário.
5. THE Tela_de_Gestão_de_Usuários SHALL exibir a opção de redefinir senha na tela de detalhes de cada usuário, sem exibir a senha atual em nenhum momento.
6. WHEN o Admin solicita a redefinição de senha de um usuário, THE Tela_de_Gestão_de_Usuários SHALL exibir uma confirmação com o nome do usuário antes de efetuar a operação, exigindo ação explícita do Admin para prosseguir.
