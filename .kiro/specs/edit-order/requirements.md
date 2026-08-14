# Requirements Document

## Introduction

Funcionalidade de edição de itens em um pedido existente com status "aguardando" no sistema Pastel das Meninas. Atualmente, o botão "+ Adicionar Item" na tela de pagamento navega para a criação de um novo pedido. Esta feature corrige esse comportamento: ao clicar em "Adicionar Item", o sistema deve abrir uma tela de edição de itens que reutiliza a mesma interface da tela "Novo Pedido" (seleção de itens do cardápio com steppers), mas atualizando o pedido existente em vez de criar um novo. O botão só deve estar visível quando o pedido ainda não foi pago.

## Glossary

- **Sistema**: O conjunto completo da solução de pedidos do food truck Pastel das Meninas (backend, mobile e web).
- **Backend**: O serviço Node.js + Express que implementa a lógica de negócio e expõe a API REST.
- **App**: O aplicativo mobile React Native / Expo utilizado pelos atendentes.
- **Pedido**: Registro no sistema que contém informações do cliente, itens selecionados do cardápio, total, status de preparo e status de pagamento.
- **Status_do_Pedido**: Estado do fluxo de preparo do pedido. Valores válidos: `aguardando`, `preparando`, `pronto`, `entregue`.
- **Status_de_Pagamento**: Estado que indica se o pedido foi pago. Valores válidos: `pendente`, `pago`.
- **Item_do_Pedido**: Um registro que associa um item do cardápio ao pedido, contendo referência ao item, nome, preço unitário e quantidade.
- **Cardápio**: Lista de itens ativos disponíveis para venda, agrupados por categoria.
- **Tela_de_Pagamento**: Interface que exibe os detalhes do pedido e permite registrar o pagamento.
- **Tela_de_Edição_de_Itens**: Interface que permite ao atendente modificar os itens de um pedido existente, reutilizando os componentes visuais da tela de criação de pedido.
- **Atendente**: Funcionário responsável por registrar pedidos e receber pagamentos.

---

## Requirements

### Requirement 1: Endpoint de Atualização de Itens do Pedido

**User Story:** Como atendente, quero atualizar os itens de um pedido existente que ainda está aguardando, para que eu possa adicionar ou remover itens antes do preparo iniciar.

#### Acceptance Criteria

1. WHEN o Atendente submete uma lista de itens atualizada (cada item contendo menuItemId e quantity) para um Pedido com Status_do_Pedido `aguardando`, THE Backend SHALL substituir todos os Item_do_Pedido existentes pelos novos itens submetidos dentro de uma única transação, gravar o nome e preço unitário atuais de cada item do Cardápio como snapshot, recalcular o total do pedido como a soma de (unit_price_cents × quantity) de todos os novos itens, e retornar HTTP 200 com o Pedido atualizado incluindo os novos itens e total.
2. IF o Atendente tenta atualizar itens de um Pedido cujo Status_do_Pedido é diferente de `aguardando`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que o pedido só pode ser editado no status aguardando.
3. IF o Atendente submete uma lista de itens vazia ou com mais de 50 itens, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando a restrição de quantidade de itens (mínimo 1, máximo 50).
4. IF o Atendente submete itens referenciando um item do Cardápio que não existe ou cujo status é `inativo`, THEN THE Backend SHALL rejeitar a requisição inteira com HTTP 422 e mensagem indicando que o item não foi encontrado ou está inativo, sem modificar nenhum dado do Pedido.
5. IF o Atendente tenta atualizar um Pedido que não existe, THEN THE Backend SHALL retornar HTTP 404 e mensagem indicando que o pedido não foi encontrado.
6. IF o Atendente submete itens com quantidade menor que 1 ou maior que 99, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que a quantidade deve ser entre 1 e 99.
7. WHEN o Backend atualiza os itens do Pedido com sucesso, THE Backend SHALL publicar um evento de broadcast no canal `orders:queue` com tipo `order_updated` contendo o Pedido atualizado com os novos itens e total.
8. IF o Atendente submete uma lista de itens contendo menuItemId duplicados, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e mensagem indicando que itens duplicados não são permitidos.

---

### Requirement 2: Visibilidade do Botão Adicionar Item

**User Story:** Como atendente, quero que o botão "Adicionar Item" só apareça quando o pedido ainda não foi pago, para que eu não tente editar um pedido que já está finalizado financeiramente.

#### Acceptance Criteria

1. WHILE o Pedido exibido na Tela_de_Pagamento possui Status_de_Pagamento `pendente`, THE App SHALL renderizar o botão "Adicionar Item" visível e habilitado.
2. WHILE o Pedido exibido na Tela_de_Pagamento possui Status_de_Pagamento `pago`, THE App SHALL ocultar o botão "Adicionar Item" completamente, sem ocupar espaço visual na tela.
3. WHEN o App recebe um evento Realtime indicando que o Status_de_Pagamento do Pedido exibido mudou de `pendente` para `pago`, THE App SHALL ocultar o botão "Adicionar Item" em no máximo 3 segundos após o recebimento do evento, sem necessidade de recarregar a tela.

---

### Requirement 3: Navegação para Tela de Edição de Itens

**User Story:** Como atendente, quero que ao clicar em "Adicionar Item" eu seja direcionado a uma tela de edição que mostra os itens atuais do pedido, para que eu possa modificar as quantidades ou adicionar novos itens sem perder o contexto do pedido existente.

#### Acceptance Criteria

1. WHEN o Atendente pressiona o botão "Adicionar Item" na Tela_de_Pagamento, THE App SHALL navegar para a Tela_de_Edição_de_Itens passando o identificador do Pedido como parâmetro de navegação.
2. WHEN a Tela_de_Edição_de_Itens é aberta, THE App SHALL carregar o Cardápio ativo e preencher as quantidades dos steppers com os valores atuais dos Item_do_Pedido existentes no Pedido, exibindo um indicador de carregamento até que o Cardápio e os dados do Pedido estejam disponíveis.
3. IF o carregamento do Cardápio ou dos dados do Pedido falhar na Tela_de_Edição_de_Itens, THEN THE App SHALL exibir uma mensagem de erro indicando a falha e impedir a interação com os steppers até que os dados sejam carregados com sucesso.
4. THE Tela_de_Edição_de_Itens SHALL exibir o título "Editar Itens" no cabeçalho em vez de "Novo Pedido".
5. THE Tela_de_Edição_de_Itens SHALL ocultar os campos de nome do cliente e origem do pedido, exibindo apenas a seção de seleção de itens do Cardápio, o total atualizado em tempo real conforme os steppers são modificados, e o botão "Salvar Alterações".
6. IF um Item_do_Pedido existente no Pedido referencia um item do Cardápio que não está mais ativo, THEN THE App SHALL omitir esse item dos steppers e não incluí-lo na lista de itens editáveis.

---

### Requirement 4: Confirmação da Edição de Itens

**User Story:** Como atendente, quero confirmar as alterações dos itens e voltar à tela de pagamento com o pedido atualizado, para que o fluxo de atendimento continue normalmente.

#### Acceptance Criteria

1. WHEN o Atendente pressiona o botão "Salvar Alterações" na Tela_de_Edição_de_Itens com ao menos um item selecionado, THE App SHALL enviar a requisição de atualização ao Backend e, em caso de sucesso, navegar de volta à Tela_de_Pagamento com os dados atualizados do Pedido.
2. IF a requisição de atualização falhar, THEN THE App SHALL exibir a mensagem de erro retornada pelo Backend na Tela_de_Edição_de_Itens sem navegar para outra tela.
3. WHILE a requisição de atualização está em andamento, THE App SHALL exibir o botão "Salvar Alterações" em estado de carregamento (loading) e desabilitar interação com o botão e com os steppers.
4. IF o Atendente não selecionou nenhum item (todas as quantidades são zero), THEN THE App SHALL exibir a mensagem "Adicione ao menos um item ao pedido" e impedir o envio da requisição.
5. THE Tela_de_Edição_de_Itens SHALL exibir o botão de confirmação com o texto "Salvar Alterações" em vez de "Criar Pedido".

---

### Requirement 5: Integridade da Atualização de Itens no Backend

**User Story:** Como operador do sistema, quero que a atualização de itens seja atômica e consistente, para que o pedido nunca fique em estado parcial caso ocorra erro durante a operação.

#### Acceptance Criteria

1. WHEN o Backend recebe uma requisição de atualização de itens de um Pedido, THE Backend SHALL executar a remoção dos itens antigos e a inserção dos novos itens dentro de uma única transação de banco de dados, garantindo que em caso de falha nenhuma alteração parcial seja persistida e o Pedido permaneça com os itens anteriores inalterados.
2. WHEN o Backend recalcula o total do Pedido, THE Backend SHALL somar o produto de unit_price_cents × quantity de cada novo item, utilizando os preços atuais obtidos da tabela menu_items (snapshot no momento da edição), não os preços que estavam armazenados nos Item_do_Pedido anteriores, e persistir o resultado no campo total_amount_cents do Pedido.
3. IF o Pedido teve seu Status_do_Pedido alterado para um valor diferente de `aguardando` entre o carregamento da Tela_de_Edição_de_Itens e o envio da requisição de atualização, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e uma mensagem indicando que o pedido só pode ser editado no status aguardando, sem modificar nenhum dado do Pedido.
4. IF algum menu_item_id enviado na requisição de atualização não existir na tabela menu_items ou estiver com status `inativo`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e uma mensagem indicando que o item não foi encontrado ou está inativo, sem modificar nenhum dado do Pedido.
5. IF ocorrer uma falha de banco de dados durante a transação de atualização de itens, THEN THE Backend SHALL executar rollback da transação e retornar HTTP 500 com uma mensagem indicando erro interno, garantindo que nenhuma alteração parcial seja persistida.
