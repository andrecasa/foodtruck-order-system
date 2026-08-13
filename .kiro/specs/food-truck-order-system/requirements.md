# Requirements Document

## Introduction

Sistema de pedidos MVP para trailer de pastéis, projetado para substituir o controle manual em papel. O sistema abrange o registro de pedidos presenciais e via WhatsApp, a fila de produção em tempo real para o preparador, o controle de pagamento e o cadastro de cardápio. A solução é composta por um app mobile (atendente), uma tela web (preparador), um backend Node.js com instância self-hosted do Supabase (Docker) e integração com a Evolution API para WhatsApp. Toda a infraestrutura é self-hosted, sem custos de serviços externos gerenciados.

## Glossary

- **Sistema**: O conjunto completo da solução de pedidos do food truck.
- **App**: O aplicativo mobile React Native / Expo utilizado pelo atendente.
- **Tela do Preparador**: A interface web React exibida no tablet ou TV do trailer, usada pelo funcionário que prepara os pedidos.
- **Backend**: O serviço Node.js + Express que implementa a lógica de negócio e expõe a API REST.
- **Supabase**: Plataforma open source self-hosted executada via Docker na infraestrutura própria, composta por PostgreSQL, Auth, Realtime e API REST — sem dependência de serviços pagos externos.
- **Realtime**: O canal de eventos do Supabase que propaga atualizações de pedidos em tempo real para os clientes conectados.
- **Evolution_API**: Serviço open source self-hosted que fornece acesso programático ao WhatsApp.
- **Bot**: O fluxo automatizado de mensagens da Evolution_API que guia o cliente na realização de um pedido via WhatsApp.
- **Atendente**: Funcionário responsável por registrar pedidos e receber pagamentos.
- **Preparador**: Funcionário responsável por preparar os pedidos.
- **Cliente**: Pessoa que realiza um pedido no trailer.
- **Pedido**: Conjunto de itens solicitados por um Cliente em uma única transação.
- **Item**: Produto do cardápio com nome, preço e categoria.
- **Status_do_Pedido**: Estado que representa a etapa atual do Pedido no fluxo de produção: `aguardando`, `preparando`, `pronto` ou `entregue`.
- **Status_de_Pagamento**: Estado que representa a situação financeira do Pedido: `pendente` ou `pago`.
- **Origem**: Canal pelo qual o Pedido foi recebido: `presencial` ou `whatsapp`.
- **Resumo_do_Dia**: Consolidação de métricas financeiras e operacionais do dia corrente.
- **Design System**: Biblioteca de componentes, tokens e diretrizes visuais que define a identidade visual do sistema de forma centralizada e substituível.
- **Token**: Variável nomeada que representa um valor de design (cor, tipografia, espaçamento, bordas), permitindo trocar toda a identidade visual alterando apenas os tokens.
- **Tema**: Conjunto de tokens que define a identidade visual de um tenant específico (ex.: cores, logo, nome do negócio).
- **White Label**: Capacidade do sistema de ser reidentificado visualmente para diferentes clientes (tenants) sem alteração de código, apenas substituindo o Tema.
- **Protótipo**: Versão inicial das interfaces com dados mockados (sem integração com backend real), usada para validar fluxos e layout antes da implementação completa.
- **Mock**: Conjunto de dados estáticos ou gerados localmente que simulam respostas do backend, sem persistência real.
- **Modo Protótipo**: Flag de configuração que ativa os mocks no lugar das chamadas reais à API.

---

## Requirements

### Requirement 1: Design System

**User Story:** Como desenvolvedor do sistema, quero uma biblioteca de componentes e tokens de design centralizada, para que toda a interface seja construída de forma consistente e a identidade visual possa ser trocada por tenant sem alterar código de componentes.

#### Acceptance Criteria

1. THE Sistema SHALL implementar um Design_System com tokens de design centralizados para todas as propriedades visuais utilizadas nos componentes: cores (primária, secundária, de fundo, de texto, de status), tipografia (família, tamanhos, pesos), espaçamentos, raios de borda e sombras.
2. THE Design_System SHALL disponibilizar os tokens em um arquivo de configuração único (ex.: `theme.config.ts`) separado dos componentes, de forma que substituir esse arquivo altere a identidade visual de toda a aplicação sem modificar nenhum componente.
3. THE Design_System SHALL fornecer um conjunto de componentes base reutilizáveis — Button, Input, Card, Badge, Modal, Typography e Layout — que consumam exclusivamente os tokens de tema, sem valores visuais hardcoded.
4. THE Sistema SHALL suportar carregamento de Tema via variável de ambiente ou arquivo de configuração externo, permitindo que um novo tenant seja configurado sem alteração de código-fonte e sem necessidade de rebuild da aplicação.
5. THE Tema SHALL incluir ao menos as seguintes propriedades configuráveis por tenant: nome do negócio, logo (URL ou arquivo local), cor primária, cor secundária, cor de fundo e cor de texto principal.
6. WHEN o Sistema inicializa, THE App e a Tela_do_Preparador SHALL carregar o Tema ativo e aplicá-lo globalmente antes de renderizar qualquer tela, garantindo que nenhum componente exiba valores do tema padrão em operação configurada.
7. THE Design_System SHALL ser documentado em um arquivo `design-system.md` descrevendo os tokens disponíveis, seus valores padrão e instruções de como criar um novo Tema.
8. THE componentes do Design_System SHALL ser acessíveis por padrão, seguindo as diretrizes WCAG 2.1 nível AA para contraste de cores entre texto e fundo em todos os estados (normal, hover, disabled, error).

---

### Requirement 2: Protótipo de Interfaces com Dados Mockados

**Depends on:** Requirement 1 (Design System)

**User Story:** Como dono do trailer, quero navegar pelas telas do sistema com dados simulados antes da integração com o backend, para que eu possa validar os fluxos e o layout sem depender da infraestrutura completa.

#### Acceptance Criteria

1. THE Sistema SHALL disponibilizar um Modo_Protótipo ativável por uma variável de ambiente (`PROTOTYPE_MODE=true`), em que todas as chamadas à API são substituídas por Mocks locais sem nenhuma alteração no código dos componentes de interface.
2. WHEN o Modo_Protótipo está ativo, THE App SHALL exibir um indicador visual persistente (ex.: banner "Modo Protótipo") em todas as telas, sinalizando que os dados não são reais.
3. WHEN o Modo_Protótipo está ativo, THE Mock SHALL fornecer um cardápio com ao menos 5 itens em 2 categorias distintas para que todas as telas de seleção de itens possam ser navegadas.
4. WHEN o Modo_Protótipo está ativo, THE Mock SHALL fornecer uma lista de pedidos com ao menos 3 pedidos em diferentes Status_do_Pedido (`aguardando`, `preparando`, `pronto`) e diferentes Status_de_Pagamento (`pendente`, `pago`), cobrindo todos os estados visuais do sistema.
5. WHEN o atendente realiza uma ação no Modo_Protótipo (criar pedido, avançar status, registrar pagamento), THE Mock SHALL simular a resposta de sucesso e atualizar o estado local da interface como se a operação tivesse sido persistida, sem gravação real.
6. WHEN o Modo_Protótipo está ativo, THE Tela_do_Preparador SHALL exibir a fila mockada com atualizações simuladas de status ao longo do tempo (ex.: um pedido `aguardando` avança para `preparando` após 10 segundos), permitindo validar o comportamento visual do Realtime.
7. THE Modo_Protótipo SHALL cobrir todas as telas previstas no sistema, construídas exclusivamente com os componentes do Design_System (Requirement 1): login, cardápio (listagem, criação de item e edição de item), criação de pedido, fila do preparador, controle de status, tela de cobrança e resumo do dia.
8. WHEN o Modo_Protótipo está desativado (`PROTOTYPE_MODE=false` ou variável ausente), THE Sistema SHALL operar normalmente conectado ao backend real, sem nenhum resquício de dados mockados.

---

### Requirement 3: Autenticação de Usuários

**User Story:** Como atendente ou preparador, quero fazer login com minhas credenciais, para que apenas usuários autorizados acessem o sistema.

#### Acceptance Criteria

1. WHEN o usuário submete e-mail e senha válidos, THE Sistema SHALL autenticar o usuário via Supabase Auth e iniciar uma sessão ativa com duração de 8 horas.
2. IF o usuário submete e-mail ou senha inválidos, THEN THE Sistema SHALL exibir a mensagem "E-mail ou senha incorretos" e manter o usuário na tela de login sem revelar qual campo está incorreto.
3. IF o usuário atingir 5 tentativas de login consecutivas com falha, THEN THE Sistema SHALL bloquear novas tentativas por 15 minutos e exibir uma mensagem informando o tempo de espera.
4. WHEN a sessão do usuário expira, THE App SHALL redirecionar o usuário automaticamente para a tela de login.
5. WHEN o usuário autenticado solicita logout, THE Sistema SHALL encerrar a sessão ativa e redirecionar para a tela de login.
6. IF um usuário não autenticado tenta acessar uma rota protegida, THEN THE Sistema SHALL redirecioná-lo para a tela de login preservando a rota de destino para redirecionamento pós-login.

---

### Requirement 4: Cadastro de Cardápio

**User Story:** Como atendente, quero cadastrar e gerenciar os itens do cardápio, para que o sistema reflita os produtos disponíveis no trailer.

#### Acceptance Criteria

1. WHEN o atendente submete nome (1–100 caracteres), preço (entre R$ 0,01 e R$ 9.999,99) e categoria de um novo item, THE Backend SHALL persistir o item no banco de dados com status `ativo`.
2. IF o atendente submete um item com nome que já existe no cardápio (comparação case-insensitive), THEN THE Backend SHALL rejeitar o cadastro com HTTP 409 e a mensagem "Item com este nome já existe".
3. IF o atendente submete um item com preço menor ou igual a zero, THEN THE Backend SHALL rejeitar o cadastro com HTTP 422 e a mensagem "Preço deve ser maior que zero".
4. IF o atendente submete um item com categoria vazia ou não pertencente às categorias cadastradas, THEN THE Backend SHALL rejeitar o cadastro com HTTP 422 e a mensagem "Categoria inválida".
5. WHEN o atendente altera nome, preço ou categoria de um item existente, THE Backend SHALL atualizar o registro correspondente sem excluí-lo, rejeitando a atualização se o novo nome colidir com outro item existente.
6. WHEN o atendente desativa um item ativo, THE Sistema SHALL marcar o item como `inativo` e ocultá-lo na seleção de novos pedidos e no cardápio exibido pelo Bot.
7. WHEN o atendente reativa um item inativo, THE Sistema SHALL marcar o item como `ativo` e torná-lo disponível novamente na seleção de novos pedidos e no cardápio do Bot.
8. THE App SHALL exibir a lista de itens do cardápio separada por categoria, ordenada alfabeticamente dentro de cada categoria.
9. THE App SHALL disponibilizar na tela de cardápio um botão de ação para criar novo item, que navegue a um formulário com os campos nome, preço (com máscara monetária R$) e categoria (seletor entre categorias cadastradas).
10. WHEN o atendente toca em um item existente na listagem do cardápio, THE App SHALL navegar ao formulário de edição pré-preenchido com os dados atuais do item (nome, preço, categoria).

---

### Requirement 5: Criação de Pedido pelo Atendente

**User Story:** Como atendente, quero criar pedidos manualmente no app, para que pedidos presenciais e os recebidos por WhatsApp sem bot sejam registrados no sistema.

#### Acceptance Criteria

1. WHEN o atendente confirma um novo pedido com nome do cliente (1–100 caracteres), origem (`presencial` ou `whatsapp`) e ao menos um item com quantidade entre 1 e 99, THE Backend SHALL persistir o Pedido com Status_do_Pedido `aguardando` e Status_de_Pagamento `pendente`.
2. THE Backend SHALL calcular o valor total do Pedido como o somatório de `(preço_unitário_no_momento_da_criação × quantidade)` para cada item incluído, preservando o preço mesmo que o item seja alterado posteriormente.
3. IF o atendente tenta confirmar um pedido sem nenhum item selecionado, THEN THE App SHALL exibir a mensagem "Adicione ao menos um item ao pedido" e não submeter o formulário.
4. IF o atendente tenta confirmar um pedido sem informar o nome do cliente, THEN THE App SHALL exibir a mensagem "Informe o nome do cliente" e não submeter o formulário.
5. THE App SHALL exibir apenas itens com status `ativo` na seleção de itens do pedido.
6. WHEN o Pedido é persistido com sucesso, THE Backend SHALL publicar um evento no Realtime para notificar os clientes conectados.
7. IF o Backend retornar erro ao tentar persistir o Pedido, THEN THE App SHALL exibir uma mensagem de erro sem limpar o formulário, permitindo nova tentativa.
8. IF o atendente submete o pedido com valor de `origem` diferente de `presencial` ou `whatsapp`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Origem inválida".

---

### Requirement 6: Fila de Pedidos em Tempo Real

**User Story:** Como preparador, quero visualizar a fila de pedidos em tempo real na tela do trailer, para que eu saiba quais pedidos preparar e em qual ordem.

#### Acceptance Criteria

1. THE Tela_do_Preparador SHALL exibir todos os pedidos com Status_do_Pedido `aguardando` ou `preparando`, ordenados por horário de criação crescente (mais antigo primeiro).
2. WHEN um novo Pedido é criado ou um Pedido existente tem seu Status_do_Pedido alterado, THE Realtime SHALL entregar o evento à Tela_do_Preparador em no máximo 3 segundos sem que o usuário precise recarregar a página.
3. THE Tela_do_Preparador SHALL exibir para cada pedido: número sequencial do pedido no dia, nome do cliente, origem (`presencial` ou `whatsapp`), lista de itens com nome e quantidade, e Status_do_Pedido atual.
4. WHILE um Pedido está com Status_do_Pedido `aguardando`, THE Tela_do_Preparador SHALL destacar visualmente o cartão do pedido com uma cor e/ou borda distintas dos pedidos com status `preparando`.
5. THE App SHALL exibir a fila de pedidos com Status_do_Pedido `aguardando` e `preparando`, na mesma ordem cronológica da Tela_do_Preparador, permitindo que o atendente acompanhe a produção.
6. WHEN a Tela_do_Preparador é aberta ou recarregada, THE Sistema SHALL carregar o estado atual de todos os pedidos `aguardando` e `preparando` antes de ativar a escuta do Realtime, garantindo que nenhum pedido seja perdido durante a inicialização.

---

### Requirement 7: Atualização de Status do Pedido

**User Story:** Como preparador, quero atualizar o status do pedido diretamente na tela do trailer, para que o atendente e o sistema reflitam o progresso real da produção.

#### Acceptance Criteria

1. WHEN o preparador avança o Status_do_Pedido de `aguardando` para `preparando`, THE Backend SHALL registrar o timestamp da transição no campo `started_at` do Pedido e publicar o evento no Realtime.
2. WHEN o preparador avança o Status_do_Pedido de `preparando` para `pronto`, THE Backend SHALL registrar o timestamp da transição no campo `ready_at` do Pedido e publicar o evento no Realtime.
3. WHEN o atendente marca um Pedido com Status_do_Pedido `pronto` como `entregue`, THE Backend SHALL registrar o timestamp da transição no campo `delivered_at` do Pedido e publicar o evento no Realtime.
4. IF o Backend recebe uma requisição de transição de status fora da sequência `aguardando → preparando → pronto → entregue`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Transição de status inválida".
5. WHEN o Status_do_Pedido é atualizado para `entregue`, THE Tela_do_Preparador SHALL remover o pedido da fila exibida imediatamente após receber o evento Realtime.
6. WHEN o Status_do_Pedido é atualizado para `pronto`, THE App SHALL exibir o pedido com indicação visual de "pronto para entrega" e permitir que o atendente o marque como `entregue`.
7. WHEN o Status_do_Pedido é atualizado para `entregue`, THE App SHALL ocultar o pedido da fila padrão exibida ao atendente.
8. THE App SHALL exibir no topo da tela de fila de pedidos um filtro de status com as opções `aguardando`, `preparando`, `pronto` e `entregue`, permitindo que o atendente selecione um ou mais status para visualização.
9. WHEN o atendente seleciona o filtro `entregue`, THE App SHALL exibir os pedidos com Status_do_Pedido `entregue` do dia corrente, ordenados por `delivered_at` decrescente (mais recente primeiro).
10. BY DEFAULT (sem interação com o filtro), THE App SHALL exibir apenas pedidos com Status_do_Pedido `aguardando`, `preparando` e `pronto`, ocultando os pedidos `entregue`.

---

### Requirement 8: Controle de Pagamento

**User Story:** Como atendente, quero registrar o pagamento de cada pedido com a forma de pagamento utilizada, para que o caixa reflita a situação financeira real do dia.

#### Acceptance Criteria

1. WHEN o atendente registra o pagamento de um Pedido com Status_de_Pagamento `pendente` informando a forma de pagamento (`dinheiro`, `pix` ou `cartão`), THE Backend SHALL atualizar o Status_de_Pagamento para `pago`, registrar a forma de pagamento e o timestamp do pagamento.
2. IF o atendente tenta registrar pagamento de um Pedido com Status_de_Pagamento já `pago`, THEN THE Backend SHALL rejeitar a requisição com HTTP 409 e a mensagem "Pedido já foi pago".
3. IF o atendente submete uma forma de pagamento diferente de `dinheiro`, `pix` ou `cartão`, THEN THE Backend SHALL rejeitar a requisição com HTTP 422 e a mensagem "Forma de pagamento inválida".
4. WHEN o atendente abre a tela de cobrança de um Pedido, THE App SHALL exibir o valor total do Pedido e os itens incluídos antes de confirmar o pagamento.
5. WHEN o pagamento é registrado, THE Backend SHALL publicar um evento no Realtime para atualizar o Status_de_Pagamento nos clientes conectados.
6. THE App SHALL exibir na lista de pedidos um indicador textual distinguindo pedidos com Status_de_Pagamento `pendente` (ex.: "Aguardando pagamento") de pedidos `pago` (ex.: "Pago"), de forma legível independente de cor.

---

### Requirement 9: Resumo do Dia (Caixa)

**User Story:** Como atendente, quero visualizar o resumo financeiro e operacional do dia, para que eu saiba o total arrecadado e quais pedidos ainda estão com pagamento pendente.

#### Acceptance Criteria

1. WHEN o atendente acessa o Resumo_do_Dia, THE Backend SHALL retornar os dados calculados com base nos pedidos cujo timestamp de criação esteja entre 00:00 e 23:59 do dia corrente no fuso horário `America/Sao_Paulo`.
2. THE Backend SHALL incluir no Resumo_do_Dia: total de pedidos criados no dia, total de pedidos com Status_de_Pagamento `pago`, total de pedidos com Status_de_Pagamento `pendente`, soma dos valores totais dos pedidos `pagos` e soma dos valores totais dos pedidos `pendentes`.
3. THE Backend SHALL incluir no Resumo_do_Dia a soma dos valores totais dos pedidos `pagos` separada por forma de pagamento (`dinheiro`, `pix`, `cartão`).
4. WHEN o Backend publicar um evento de pagamento no Realtime (conforme Requirement 8, Critério 5), THE App SHALL atualizar automaticamente os totais do Resumo_do_Dia sem necessidade de recarregar a tela.

---

### Requirement 10: Recepção de Pedidos via WhatsApp (Bot)

**User Story:** Como cliente, quero fazer meu pedido via WhatsApp interagindo com um bot, para que meu pedido seja registrado no sistema sem precisar ir pessoalmente ao trailer.

#### Acceptance Criteria

1. WHEN a Evolution_API recebe uma mensagem de um número sem sessão de pedido ativa, THE Bot SHALL iniciar o fluxo de pedido enviando uma saudação com o nome do trailer e o cardápio com itens ativos agrupados por categoria.
2. IF a Evolution_API recebe uma mensagem de um número com sessão de pedido já ativa, THEN THE Bot SHALL retomar o fluxo existente a partir do estado atual, sem iniciar um novo fluxo.
3. WHEN o cliente seleciona itens e quantidades durante o fluxo do Bot, THE Bot SHALL acumular as escolhas e, antes de solicitar confirmação, exibir um resumo contendo: lista de itens com quantidade e preço unitário, e valor total do pedido.
4. WHEN o cliente confirma o pedido no Bot, THE Backend SHALL criar o Pedido com Origem `whatsapp`, Status_do_Pedido `aguardando` e Status_de_Pagamento `pendente`, usando o nome do perfil do WhatsApp como nome do cliente; IF o nome do perfil não estiver disponível, THEN o Backend SHALL usar o número de telefone formatado como nome do cliente.
5. IF o cliente envia uma mensagem fora do fluxo esperado durante a interação com o Bot, THEN THE Bot SHALL responder listando as opções válidas no momento e aguardar nova entrada sem avançar o estado do fluxo.
6. WHEN o Pedido via WhatsApp é criado com sucesso, THE Bot SHALL enviar ao cliente uma mensagem de confirmação contendo o número sequencial do pedido no dia e o valor total.
7. WHEN o cliente confirma o pedido, THE Bot SHALL encerrar a sessão de conversa ativa para aquele número.
8. IF o cliente ficar inativo por 10 minutos durante o fluxo, THEN THE Bot SHALL encerrar a sessão, descartar o pedido em andamento e enviar uma mensagem informando que o tempo expirou.

---

### Requirement 11: Cardápio via WhatsApp

**User Story:** Como cliente no WhatsApp, quero visualizar o cardápio atualizado durante o fluxo do bot, para que eu faça pedidos apenas de itens disponíveis.

#### Acceptance Criteria

1. WHEN o Bot exibe o cardápio para o cliente, THE Bot SHALL buscar apenas itens com status `ativo` no banco de dados no momento da consulta, garantindo que itens desativados após o início do fluxo não apareçam em novas consultas.
2. WHEN o Bot exibe o cardápio, THE Bot SHALL agrupar os itens por categoria e listar para cada item seu nome e preço formatado em reais (ex.: "R$ 7,50").
3. IF nenhum item do cardápio estiver com status `ativo` no momento da consulta, THEN THE Bot SHALL informar ao cliente que o trailer está temporariamente sem itens disponíveis e encerrar o fluxo de pedido.

---

### Requirement 12: Numeração Sequencial de Pedidos

**User Story:** Como atendente e preparador, quero que cada pedido tenha um número sequencial por dia, para que a comunicação sobre pedidos seja simples e sem ambiguidade.

#### Acceptance Criteria

1. WHEN um novo Pedido é criado, THE Backend SHALL atribuir ao Pedido um número sequencial reiniciado a partir de 1 a cada novo dia (00:00 no fuso horário `America/Sao_Paulo`).
2. THE Sistema SHALL exibir o número sequencial do Pedido em todas as telas que listam ou detalham pedidos, bem como nas mensagens de confirmação enviadas pelo Bot.
3. THE Backend SHALL garantir, por meio de mecanismo de lock no banco de dados (ex.: sequence por dia ou transação serializable), que dois Pedidos criados concorrentemente no mesmo dia nunca recebam o mesmo número sequencial; em caso de conflito detectado, o Backend SHALL rejeitar a segunda operação e retornar HTTP 409.

---

### Requirement 13: Persistência e Disponibilidade dos Dados

**User Story:** Como operador do sistema, quero que os dados de pedidos e cardápio sejam persistidos de forma confiável, para que nenhuma informação seja perdida em caso de falha de conexão.

#### Acceptance Criteria

1. THE Backend SHALL persistir todo Pedido confirmado no banco de dados PostgreSQL da instância self-hosted do Supabase antes de retornar resposta de sucesso ao solicitante; qualquer falha de persistência SHALL resultar em resposta de erro ao cliente sem criação parcial de dados.
2. IF a conexão com o Supabase Realtime (self-hosted) for interrompida, THEN THE Tela_do_Preparador SHALL exibir um indicador visível de "conexão perdida", manter o último estado da fila sinalizado como possivelmente desatualizado, e tentar reconectar automaticamente a cada 5 segundos.
3. WHEN a conexão com o Supabase Realtime é restabelecida, THE Tela_do_Preparador SHALL recarregar todos os pedidos com Status_do_Pedido `aguardando` ou `preparando` do Backend antes de reativar a escuta do Realtime, garantindo consistência do estado exibido.
4. THE Backend SHALL responder a requisições da API em no máximo 2 segundos sob carga de até 50 requisições simultâneas em condições normais de operação.

---

### Requirement 14: Infraestrutura Self-Hosted

**User Story:** Como operador do sistema, quero que toda a infraestrutura rode na minha própria hospedagem (local ou on-premise), para que não haja nenhum custo de serviço externo gerenciado e eu tenha controle total sobre os dados e a disponibilidade.

#### Acceptance Criteria

1. THE Sistema SHALL operar exclusivamente com serviços open source self-hosted: Supabase (PostgreSQL + Auth + Realtime), backend Node.js e Evolution API, todos executados via Docker Compose na infraestrutura do operador, sem dependência de nenhum serviço externo pago.
2. THE Sistema SHALL disponibilizar um arquivo `docker-compose.yml` na raiz do repositório que inicialize todos os serviços necessários (banco de dados, backend, Evolution API e Supabase) com um único comando (`docker compose up`), funcionando tanto em ambiente local (notebook/desktop) quanto em servidor on-premise.
3. THE Sistema SHALL disponibilizar um arquivo `.env.example` documentando todas as variáveis de ambiente necessárias para execução, com valores padrão funcionais para ambiente local, sem conter segredos reais.
4. THE Sistema SHALL funcionar sem acesso à internet durante a operação normal, exceto pela integração com WhatsApp (Evolution API), que requer conectividade de saída apenas para o servidor do WhatsApp.
5. WHEN o operador executa `docker compose up` em uma máquina com Docker instalado, THE Sistema SHALL estar operacional e acessível localmente em no máximo 5 minutos, incluindo migrações de banco de dados e seed inicial do cardápio.
6. THE Sistema SHALL persistir todos os dados exclusivamente no volume Docker local, garantindo que nenhuma informação de pedidos, cardápio ou pagamentos trafegue para serviços externos.
