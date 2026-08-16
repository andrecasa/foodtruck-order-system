# Requirements Document

## Introduction

Módulo de gerenciamento de categorias (CRUD) para o sistema de pedidos. As categorias organizam os itens do cardápio em grupos lógicos (ex: "Pastéis Salgados", "Pastéis Doces", "Bebidas"). Atualmente, as categorias existem no banco de dados (tabela `categories`) e são utilizadas indiretamente pelos itens do cardápio, porém não possuem uma interface de gerenciamento própria. Esta feature permite que administradores criem, listem, editem, reordenem e excluam categorias, seguindo os mesmos padrões de CRUD já estabelecidos no módulo de itens do cardápio.

## Glossary

- **Sistema**: O conjunto completo da solução de pedidos do food truck (backend + mobile).
- **Backend**: O serviço Node.js + Express que implementa a lógica de negócio e expõe a API REST.
- **App**: O aplicativo mobile React Native / Expo utilizado pelos operadores.
- **Admin**: Usuário com role `admin` e permissão de gerenciar categorias.
- **Categoria**: Registro na tabela `categories` composto por id (UUID), nome (texto único), sort_order (inteiro), status e created_at (timestamp).
- **Sort_Order**: Campo numérico inteiro que define a posição de exibição da categoria na listagem e no cardápio. Valores menores aparecem primeiro.
- **Status_da_Categoria**: Estado que indica se a categoria está visível no cardápio: `ativo` ou `inativo`. Categorias inativas não aparecem no agrupamento do cardápio público.
- **Item_do_Cardápio**: Registro na tabela `menu_items` que pertence a uma Categoria via chave estrangeira `category_id`.
- **Tela_de_Categorias**: Interface no App acessível pelo Drawer menu (ícone `folder_open`) para gerenciar categorias.

---

## Requirements

### Requirement 1: Listagem de Categorias

**User Story:** Como admin, quero visualizar todas as categorias cadastradas no sistema ordenadas por sort_order, para que eu possa entender a organização atual do cardápio e identificar se preciso criar, editar ou remover alguma categoria.

#### Acceptance Criteria

1. WHEN o Admin acessa a Tela_de_Categorias, THE Backend SHALL retornar todas as categorias cadastradas (independentemente do Status_da_Categoria) contendo: id, nome, sort_order, Status_da_Categoria e quantidade total de itens do cardápio associados (contando itens em qualquer status).
2. THE Backend SHALL ordenar a lista de categorias por sort_order em ordem crescente; em caso de empate no sort_order, SHALL ordenar por nome em ordem alfabética crescente.
3. THE Tela_de_Categorias SHALL exibir para cada categoria: o nome, o Status_da_Categoria e a quantidade total de itens do cardápio associados.
4. IF nenhuma categoria estiver cadastrada, THEN THE Tela_de_Categorias SHALL exibir uma mensagem indicando que não há categorias cadastradas.
5. IF o Backend falhar ao buscar a lista de categorias, THEN THE Tela_de_Categorias SHALL exibir uma mensagem de erro e oferecer a opção de tentar novamente.
6. THE Tela_de_Categorias SHALL exibir um botão para criar nova categoria, seguindo o padrão visual do botão "+ Novo Item" da tela de Cardápio.

---

### Requirement 2: Criação de Categoria

**User Story:** Como admin, quero criar novas categorias informando o nome, para que eu possa organizar novos itens do cardápio em grupos adequados.

#### Acceptance Criteria

1. WHEN o Admin submete um nome de categoria (1–100 caracteres após trim de espaços nas extremidades, sem ser composto somente por espaços em branco), THE Backend SHALL criar a categoria com o nome trimado, sort_order igual ao maior sort_order existente + 1 (ou 0 se não houver categorias), Status_da_Categoria `ativo`, e retornar HTTP 201 com id, nome, sort_order, status e created_at.
2. IF o Admin submete um nome que já está cadastrado (comparação case-insensitive após trim), THEN THE Backend SHALL rejeitar a requisição com HTTP 409 e a mensagem "Já existe uma categoria com este nome".
3. IF o Admin submete um nome vazio, composto somente por espaços em branco, ou com mais de 100 caracteres após trim, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Nome deve ter entre 1 e 100 caracteres".
4. IF qualquer campo obrigatório (nome) estiver ausente no corpo da requisição, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Nome é obrigatório".
5. WHEN a criação é bem-sucedida, THE Tela_de_Categorias SHALL navegar de volta à listagem e exibir a nova categoria na última posição conforme sort_order.
6. IF o Backend falhar ao processar a criação da categoria por erro inesperado, THEN THE Tela_de_Categorias SHALL exibir uma mensagem de erro indicando que a categoria não pôde ser criada e manter o Admin no formulário com os dados preenchidos preservados.

---

### Requirement 3: Edição de Categoria

**User Story:** Como admin, quero editar o nome de uma categoria existente, para que eu possa corrigir erros de digitação ou adequar a nomenclatura do cardápio.

#### Acceptance Criteria

1. WHEN o Admin submete um novo nome (1–100 caracteres após remoção de espaços nas extremidades, sem espaços em branco somente) para uma categoria existente, THE Backend SHALL armazenar o nome com espaços nas extremidades removidos (trim), atualizar o nome da categoria e retornar HTTP 200 com id, nome, sort_order e created_at.
2. IF o Admin submete um nome que já está cadastrado por outra categoria (comparação case-insensitive após trim), THEN THE Backend SHALL rejeitar a requisição com HTTP 409 e a mensagem "Já existe uma categoria com este nome".
3. IF o Admin tenta editar uma categoria que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Categoria não encontrada".
4. IF o Admin submete um nome vazio, composto somente por espaços em branco, ou com mais de 100 caracteres após trim, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Nome deve ter entre 1 e 100 caracteres".
5. IF o campo nome estiver ausente no corpo da requisição, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Nome é obrigatório".
6. WHEN o Admin submete o mesmo nome que a categoria já possui (comparação case-insensitive após trim), THE Backend SHALL aceitar a requisição normalmente e retornar HTTP 200 com os dados da categoria.
7. WHEN o Admin seleciona uma categoria para edição, THE Tela_de_Categorias SHALL exibir o formulário de edição com o nome atual da categoria pré-preenchido no campo de texto.
8. WHEN a edição é bem-sucedida, THE Tela_de_Categorias SHALL navegar de volta à listagem e exibir o nome atualizado.

---

### Requirement 4: Reordenação de Categorias

**User Story:** Como admin, quero alterar a ordem de exibição das categorias, para que o cardápio apresente os grupos na sequência mais adequada para os clientes.

#### Acceptance Criteria

1. WHEN o Admin submete uma lista ordenada contendo todos os ids de categorias existentes, THE Backend SHALL atualizar o sort_order de cada categoria de acordo com a posição na lista (índice 0 recebe sort_order 0, índice 1 recebe sort_order 1, e assim por diante) de forma atômica (todas as categorias são atualizadas ou nenhuma é), e retornar HTTP 200 com a lista atualizada.
2. IF a lista submetida contém ids duplicados, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Lista contém categorias duplicadas".
3. IF a lista submetida contém algum id que não corresponde a uma categoria existente, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Categoria não encontrada na lista".
4. IF a lista submetida está vazia, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Lista de categorias não pode estar vazia".
5. IF a lista submetida não contém todos os ids de categorias existentes (quantidade de ids difere da quantidade total de categorias cadastradas), THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "A lista deve conter todas as categorias".
6. THE Tela_de_Categorias SHALL permitir ao Admin reordenar categorias por meio de arrastar e soltar (drag-and-drop), atualizando a ordem visual na listagem ao soltar o item e enviando a nova ordem ao Backend automaticamente.
7. IF o Backend retornar erro ao processar a reordenação, THEN THE Tela_de_Categorias SHALL reverter a ordem visual para o estado anterior ao arraste e exibir uma mensagem de erro ao Admin.

---

### Requirement 5: Desativação e Reativação de Categoria

**User Story:** Como admin, quero desativar uma categoria para ocultá-la do cardápio sem excluí-la, para que eu possa suspender temporariamente um grupo de itens e reativá-lo quando necessário.

#### Acceptance Criteria

1. WHEN o Admin desativa uma categoria com Status_da_Categoria `ativo` que não possui nenhum Item_do_Cardápio com status `ativo`, THE Backend SHALL alterar o Status_da_Categoria para `inativo` e retornar HTTP 200 com id, nome, sort_order, status e created_at.
2. IF o Admin tenta desativar uma categoria que possui ao menos um Item_do_Cardápio com status `ativo`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Categoria possui itens ativos. Desative os itens antes de desativar a categoria".
3. WHEN o Admin reativa uma categoria com Status_da_Categoria `inativo`, THE Backend SHALL alterar o Status_da_Categoria para `ativo` e retornar HTTP 200 com id, nome, sort_order, status e created_at.
4. IF o Admin tenta desativar uma categoria que já está com Status_da_Categoria `inativo`, THEN THE Backend SHALL retornar HTTP 422 e a mensagem "Categoria já está inativa".
5. IF o Admin tenta reativar uma categoria que já está com Status_da_Categoria `ativo`, THEN THE Backend SHALL retornar HTTP 422 e a mensagem "Categoria já está ativa".
6. IF o Admin tenta desativar ou reativar uma categoria que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Categoria não encontrada".
7. WHILE uma categoria possui Status_da_Categoria `inativo`, THE Backend SHALL excluir essa categoria do agrupamento de itens retornado pelo endpoint de listagem do cardápio (GET /api/menu).
8. THE Tela_de_Categorias SHALL exibir um toggle de status para cada categoria, indicando visualmente se está ativa ou inativa, e atualizar o toggle imediatamente ao receber confirmação de sucesso do Backend.

---

### Requirement 6: Exclusão de Categoria

**User Story:** Como admin, quero excluir uma categoria que não é mais necessária, para que o cardápio permaneça limpo e organizado sem categorias obsoletas.

#### Acceptance Criteria

1. WHEN o Admin confirma a exclusão de uma categoria que não possui nenhum Item_do_Cardápio associado (nem ativo nem inativo), THE Backend SHALL remover o registro da categoria permanentemente, manter o sort_order das categorias restantes inalterado, e retornar HTTP 200 com a mensagem "Categoria excluída com sucesso".
2. IF a categoria possui ao menos um Item_do_Cardápio associado (independente do status do item), THEN THE Backend SHALL rejeitar a exclusão com HTTP 422 e a mensagem "Categoria possui itens associados. Mova ou exclua os itens antes de excluir a categoria".
3. IF o Admin tenta excluir uma categoria que não existe, THEN THE Backend SHALL retornar HTTP 404 com a mensagem "Categoria não encontrada".
4. WHEN o Admin solicita a exclusão de uma categoria, THE Tela_de_Categorias SHALL exibir um diálogo de confirmação contendo o nome da categoria e dois botões: um para confirmar a exclusão e outro para cancelar a operação.
5. IF o Admin cancela o diálogo de confirmação de exclusão, THEN THE Tela_de_Categorias SHALL fechar o diálogo sem enviar a requisição de exclusão ao Backend e manter a listagem inalterada.
6. WHEN a exclusão é bem-sucedida, THE Tela_de_Categorias SHALL remover a categoria excluída da listagem sem recarregar a página, mantendo a ordem das categorias restantes.

---

### Requirement 7: Controle de Acesso

**User Story:** Como operador do sistema, quero que apenas administradores possam gerenciar categorias, para que atendentes e preparadores não alterem a estrutura do cardápio indevidamente.

#### Acceptance Criteria

1. IF um usuário com role `atendente` ou `preparador` tenta acessar qualquer endpoint de gestão de categorias (criar, listar, editar, reordenar, desativar, reativar ou excluir), THEN THE Backend SHALL rejeitar a requisição com HTTP 403 e a mensagem "Acesso restrito a administradores".
2. THE Tela_de_Categorias SHALL não renderizar o item de menu "Categorias" (ícone `folder_open`) no Drawer para usuários com role diferente de `admin`, de modo que o item não seja visível nem interativo.
3. IF um usuário autenticado com role diferente de `admin` tenta acessar a rota da Tela_de_Categorias diretamente (por navegação programática ou deep link), THEN THE App SHALL redirecionar o usuário para a tela de pedidos (fila de pedidos) em no máximo 1 segundo, sem exibir nenhum conteúdo da Tela_de_Categorias durante a transição.
