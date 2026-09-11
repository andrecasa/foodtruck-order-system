# Requirements Document

## Introduction

Esta feature adiciona pagamentos online via **Mercado Pago** ao `order-system`. Hoje o pagamento de um pedido é registrado manualmente (endpoint `POST /api/orders/:id/payment`, que grava `payment_status = 'pago'`, `payment_method` e `paid_at` na tabela `orders`). Não há integração com nenhum gateway online.

O objetivo é permitir que o cliente pague um pedido eletronicamente pelos meios cobertos pelo Mercado Pago — **Pix (com QR Code)** e **cartão de crédito/débito** — e que o pedido seja marcado como pago de forma confiável, com a confirmação vindo do gateway por **webhook**, e não da resposta imediata do cliente.

O sistema é **multi-tenant**: cada tenant é um estabelecimento (ex.: food truck). Cada tenant recebe os pagamentos na sua própria conta Mercado Pago, portanto as credenciais do Mercado Pago (access token, chave pública, segredo de assinatura de webhook) são **por tenant**. Um pedido de um tenant nunca pode ser pago com as credenciais de outro, e uma notificação do gateway só pode afetar pedidos do tenant a que pertence.

O desenho respeita as restrições já existentes no sistema:

- Fluxo de backend `routes → controller → service → tenantRepository`, com todo acesso a dados tenant-scoped passando por `tenantRepository(tenantId)`.
- Erros via `ServiceError` (`statusCode`/`code`) mapeados pelo `errorHandler` central, sem vazar detalhes internos ao cliente.
- Validação com Zod (schemas compartilhados em `@order-system/shared` quando aplicável).
- Mensagens de erro, comentários e JSDoc em pt-BR.
- Webhooks recebidos por rota pública (não autenticada por sessão de usuário), à semelhança de `webhook.routes.ts`.
- Mobile Expo/React Native com componentes reutilizáveis, estilos via `useTheme()`, `testID` e acessibilidade em elementos interativos, delegando validação ao backend.

A cobrança de pagamento não altera as colunas de pagamento existentes em `orders` (`payment_status`, `payment_method`, `total_amount_cents`, `paid_at`): a integração as reutiliza como a fonte de verdade do estado de pagamento do pedido.

O registro **manual** de pagamento já existente é **preservado** e continua funcionando. O endpoint `POST /api/orders/:id/payment` (função `registerPayment`), usado quando o operador recebe pela maquininha ou em dinheiro, permanece inalterado. A integração com o Mercado Pago é **aditiva**: adiciona o pagamento online sem remover nem modificar o fluxo manual. Ambos os caminhos — manual e online — escrevem nas mesmas colunas de `orders` (`payment_status`, `payment_method`, `paid_at`), que seguem sendo a fonte de verdade única do estado de pagamento do Pedido.

## Glossary

- **Sistema_Pagamento**: Componente de backend responsável por criar cobranças no Mercado Pago, receber e processar webhooks, e atualizar o estado de pagamento dos pedidos. Exposto por endpoints da API.
- **Gateway**: O Mercado Pago, provedor externo que processa Pix e cartão e emite notificações (webhooks) sobre mudanças de estado do pagamento.
- **Tenant**: Estabelecimento, registro na tabela `tenants`, identificado por `tenant_id`. Cada Tenant possui sua própria conta e credenciais no Gateway.
- **Credenciais_Gateway**: Conjunto de dados de autenticação do Tenant junto ao Gateway — access token, chave pública e segredo de assinatura de webhook — armazenados de forma associada ao `tenant_id`.
- **Pedido**: Registro na tabela `orders`, pertencente a um Tenant, com `total_amount_cents`, `payment_status` (`pendente` | `pago`), `payment_method` e `paid_at`.
- **Cobranca**: Solicitação de pagamento criada no Gateway para um Pedido específico, com um valor em centavos, um meio de pagamento e um identificador retornado pelo Gateway.
- **Pagamento_Gateway**: Registro persistido pelo Sistema_Pagamento que vincula uma Cobranca ao Pedido, ao Tenant e ao identificador do Gateway, guardando o estado atual do pagamento no Gateway.
- **Estado_Cobranca**: Estado do Pagamento_Gateway conforme reportado pelo Gateway, mapeado para um dos valores internos: `pendente`, `aprovado`, `rejeitado`, `cancelado`, `estornado`.
- **Webhook**: Requisição HTTP enviada pelo Gateway ao Sistema_Pagamento notificando mudança de estado de um Pagamento_Gateway.
- **Assinatura_Webhook**: Cabeçalho de assinatura enviado pelo Gateway que permite ao Sistema_Pagamento verificar a autenticidade e integridade de um Webhook usando o segredo de assinatura das Credenciais_Gateway do Tenant.
- **App_Cliente**: Interface (mobile Expo/React Native, também PWA) usada pelo cliente para iniciar e acompanhar o pagamento de um Pedido.
- **Meio_Pagamento_Online**: Meio de pagamento processado pelo Gateway. Para esta feature: `pix` e `cartão crédito` e `cartão débito`.
- **Chave_Idempotencia**: Identificador único enviado ao Gateway na criação de uma Cobranca para evitar Cobrancas duplicadas em caso de reenvio da mesma solicitação.

## Requirements

### Requisito 1: Configuração das credenciais do Mercado Pago por tenant

**User Story:** Como operador de um estabelecimento, quero cadastrar as credenciais da minha conta Mercado Pago, para que os pagamentos dos meus pedidos sejam recebidos na minha própria conta.

#### Critérios de Aceitação

1. THE Sistema_Pagamento SHALL armazenar as Credenciais_Gateway associadas a exatamente um `tenant_id`.
2. THE Sistema_Pagamento SHALL armazenar o access token e o segredo de assinatura de webhook das Credenciais_Gateway de forma protegida, sem retorná-los em texto puro em nenhuma resposta da API.
3. WHEN um operador autenticado cadastra ou atualiza as Credenciais_Gateway do próprio Tenant com todos os campos obrigatórios preenchidos, THE Sistema_Pagamento SHALL persistir os valores associados ao `tenant_id` da sessão.
4. IF uma solicitação de criação de Cobranca é recebida para um Tenant sem Credenciais_Gateway cadastradas, THEN THE Sistema_Pagamento SHALL recusar a solicitação com erro em pt-BR indicando que o pagamento online não está configurado, sem criar Cobranca.
5. IF um operador cadastra ou atualiza as Credenciais_Gateway com um ou mais campos obrigatórios ausentes ou vazios, THEN THE Sistema_Pagamento SHALL rejeitar a solicitação com erro de validação em pt-BR, sem persistir as Credenciais_Gateway.
6. IF uma operação tenta ler ou escrever as Credenciais_Gateway de um Tenant diferente do Tenant proprietário, THEN THE Sistema_Pagamento SHALL recusar o acesso antes de qualquer I/O, sem ler nem alterar as Credenciais_Gateway.

### Requisito 2: Criação de cobrança para um pedido

**User Story:** Como cliente, quero iniciar o pagamento de um pedido escolhendo um meio de pagamento, para que eu receba a instrução de pagamento correspondente.

#### Critérios de Aceitação

1. WHEN uma solicitação de Cobranca é recebida para um Pedido existente do Tenant com um Meio_Pagamento_Online válido, THE Sistema_Pagamento SHALL criar uma Cobranca no Gateway no valor igual ao `total_amount_cents` do Pedido.
2. THE Sistema_Pagamento SHALL resolver o Pedido alvo exclusivamente dentro do Tenant informado, via `tenantRepository(tenantId)`.
3. IF o Pedido informado não existe no Tenant, THEN THE Sistema_Pagamento SHALL retornar erro `404` em pt-BR indicando que o pedido não foi encontrado, sem criar Cobranca.
4. IF o Meio_Pagamento_Online informado não é um dentre `pix`, `cartão crédito` ou `cartão débito`, THEN THE Sistema_Pagamento SHALL retornar erro de validação `422` em pt-BR, sem criar Cobranca.
5. IF o Pedido informado já possui `payment_status` igual a `pago`, THEN THE Sistema_Pagamento SHALL retornar erro `409` em pt-BR indicando que o pedido já foi pago, sem criar Cobranca.
6. WHEN o Sistema_Pagamento cria uma Cobranca no Gateway, THE Sistema_Pagamento SHALL persistir um Pagamento_Gateway vinculando o identificador retornado pelo Gateway ao Pedido, ao `tenant_id` e ao Estado_Cobranca inicial `pendente` antes de responder ao App_Cliente.
7. WHEN uma Cobranca é criada com sucesso, THE Sistema_Pagamento SHALL responder ao App_Cliente com o identificador do Pagamento_Gateway, o Meio_Pagamento_Online e o Estado_Cobranca `pendente`.
8. WHERE o Meio_Pagamento_Online é `pix`, THE Sistema_Pagamento SHALL retornar ao App_Cliente os dados do QR Code Pix (código copia-e-cola e imagem do QR Code) fornecidos pelo Gateway.
9. WHERE o Meio_Pagamento_Online é `cartão crédito` ou `cartão débito`, THE Sistema_Pagamento SHALL retornar ao App_Cliente os dados necessários para concluir o pagamento por cartão fornecidos pelo Gateway.
10. IF o valor `total_amount_cents` do Pedido é menor ou igual a 0, THEN THE Sistema_Pagamento SHALL recusar a criação da Cobranca com erro de validação `422` em pt-BR, sem chamar o Gateway.
11. IF a chamada ao Gateway para criar a Cobranca falha, THEN THE Sistema_Pagamento SHALL preservar o estado anterior, não persistindo nenhum Pagamento_Gateway em estado inconsistente para o Pedido.
12. WHILE existe um Pagamento_Gateway com Estado_Cobranca igual a `pendente` para o mesmo Pedido, mesmo Meio_Pagamento_Online e mesmo valor da Cobranca, THE Sistema_Pagamento SHALL reutilizar essa Cobranca pendente equivalente em vez de criar uma nova ao receber solicitação equivalente.

### Requisito 3: Idempotência da criação de cobrança

**User Story:** Como operador, quero que reenvios de uma mesma solicitação de pagamento não gerem cobranças duplicadas, para que o cliente não seja cobrado mais de uma vez pelo mesmo pedido.

#### Critérios de Aceitação

1. WHEN o Sistema_Pagamento cria uma Cobranca no Gateway, THE Sistema_Pagamento SHALL enviar uma Chave_Idempotencia derivada de forma determinística do Pedido e do Meio_Pagamento_Online.
2. WHILE existe um Pagamento_Gateway com Estado_Cobranca igual a `pendente` para o mesmo Pedido, mesmo Meio_Pagamento_Online e mesmo valor da Cobranca, THE Sistema_Pagamento SHALL reutilizar essa Cobranca existente em vez de criar uma nova ao receber solicitação equivalente.
3. IF a criação da Cobranca é reenviada com a mesma Chave_Idempotencia, THEN THE Sistema_Pagamento SHALL retornar a Cobranca originalmente criada sem gerar uma nova cobrança no Gateway.
4. IF existe um Pagamento_Gateway para o mesmo Pedido e Meio_Pagamento_Online cujo Estado_Cobranca não é mais `pendente`, THEN THE Sistema_Pagamento SHALL permitir a criação de uma nova Cobranca.
5. IF o Gateway recusa a Chave_Idempotencia reutilizada, THEN THE Sistema_Pagamento SHALL retornar erro em pt-BR indicando que não foi possível iniciar o pagamento, sem persistir estado inconsistente.

### Requisito 4: Recebimento e autenticação de webhooks

**User Story:** Como responsável pela integração, quero que apenas notificações legítimas do Mercado Pago sejam processadas, para que o estado de pagamento dos pedidos não possa ser forjado.

#### Critérios de Aceitação

1. THE Sistema_Pagamento SHALL expor um endpoint público (sem autenticação por sessão de usuário) para recebimento de Webhooks do Gateway.
2. WHEN um Webhook é recebido, THE Sistema_Pagamento SHALL verificar a Assinatura_Webhook usando o segredo de assinatura das Credenciais_Gateway do Tenant correspondente antes de processar a notificação.
3. IF a Assinatura_Webhook está ausente ou não confere, THEN THE Sistema_Pagamento SHALL recusar a notificação com resposta HTTP `401`, sem alterar nenhum Pedido ou Pagamento_Gateway.
4. WHEN um Webhook autenticado é recebido, THE Sistema_Pagamento SHALL resolver o Tenant e o Pagamento_Gateway a partir do identificador do Gateway contido na notificação.
5. IF um Webhook autenticado referencia um identificador do Gateway que não corresponde a nenhum Pagamento_Gateway conhecido, THEN THE Sistema_Pagamento SHALL responder com HTTP `200` sem alterar nenhum Pedido, registrando o evento para diagnóstico interno.
6. WHEN o processamento de um Webhook autenticado é concluído, THE Sistema_Pagamento SHALL responder ao Gateway com HTTP `200` para confirmar o recebimento.
7. IF o processamento de um Webhook autenticado falha por erro interno, THEN THE Sistema_Pagamento SHALL responder com HTTP `500` sem expor detalhes internos, registrando a falha para diagnóstico.
8. IF o corpo de um Webhook está ausente ou malformado, THEN THE Sistema_Pagamento SHALL recusar a notificação sem alterar nenhum Pedido ou Pagamento_Gateway, registrando o evento para diagnóstico interno.
9. WHEN um Webhook autenticado é recebido mais de uma vez para o mesmo evento, THE Sistema_Pagamento SHALL processá-lo de forma idempotente, sem repetir os efeitos colaterais já aplicados ao Pedido ou ao Pagamento_Gateway.
10. WHEN um Webhook autenticado é recebido, THE Sistema_Pagamento SHALL responder ao Gateway com HTTP `200` em até 10 segundos.
11. IF o Tenant não pode ser resolvido durante a verificação da Assinatura_Webhook, THEN THE Sistema_Pagamento SHALL recusar a notificação com resposta HTTP `401`, sem alterar nenhum Pedido ou Pagamento_Gateway.

### Requisito 5: Idempotência do processamento de webhooks

**User Story:** Como responsável pela integração, quero que notificações repetidas do gateway não causem efeitos duplicados, para que o pedido seja marcado como pago uma única vez.

#### Critérios de Aceitação

1. WHEN um Webhook autenticado indica que um Pagamento_Gateway já se encontra no Estado_Cobranca reportado, THE Sistema_Pagamento SHALL responder com HTTP `200` sem repetir os efeitos colaterais já aplicados ao Pedido.
2. WHEN o mesmo Webhook de aprovação é processado mais de uma vez para o mesmo Pagamento_Gateway, THE Sistema_Pagamento SHALL manter o Pedido com exatamente um `paid_at` e um `payment_status` igual a `pago`, sem alterá-los em processamentos subsequentes.
3. THE Sistema_Pagamento SHALL registrar o identificador único do evento de Webhook processado, de modo que reprocessar o mesmo evento não produza efeitos adicionais.
4. IF um Webhook autenticado chega sem identificador de evento ou com identificador já processado, THEN THE Sistema_Pagamento SHALL tratá-lo de forma idempotente, respondendo com HTTP `200` sem aplicar novos efeitos.

### Requisito 6: Confirmação de pagamento aprovado

**User Story:** Como operador, quero que o pedido seja marcado como pago automaticamente quando o Mercado Pago aprova o pagamento, para que eu não precise registrar o pagamento manualmente.

#### Critérios de Aceitação

1. WHEN um Webhook autenticado reporta Estado_Cobranca `aprovado` para um Pagamento_Gateway cujo Pedido está com `payment_status` igual a `pendente`, THE Sistema_Pagamento SHALL atualizar o Pedido definindo `payment_status` igual a `pago`, `payment_method` conforme o Meio_Pagamento_Online da Cobranca e `paid_at` igual ao instante de recebimento do Webhook.
2. WHEN o Sistema_Pagamento marca um Pedido como `pago`, THE Sistema_Pagamento SHALL atualizar o Estado_Cobranca do Pagamento_Gateway correspondente para `aprovado`.
3. THE Sistema_Pagamento SHALL efetuar a atualização do Pedido e do Pagamento_Gateway de forma atômica, de modo que ambos sejam alterados juntos ou, em caso de falha em qualquer uma das alterações, nenhum dos dois seja alterado (ambos preservados em seu estado anterior).
4. WHEN um Pedido passa a `pago` em decorrência de um Webhook, THE Sistema_Pagamento SHALL publicar um evento de pagamento no canal em tempo real específico do Tenant, com o mesmo formato e conteúdo do evento publicado pelo fluxo de pagamento manual existente.
5. IF um Webhook autenticado reporta Estado_Cobranca `aprovado` para um Pagamento_Gateway cujo Pedido já está com `payment_status` igual a `pago`, THEN THE Sistema_Pagamento SHALL tratar o Webhook como duplicado, não alterar o Pedido nem o Pagamento_Gateway, não publicar novo evento em tempo real e responder com sucesso.
6. IF um Webhook autenticado reporta Estado_Cobranca `aprovado` para um Pagamento_Gateway cujo Pedido está em `payment_status` diferente de `pendente` e de `pago`, THEN THE Sistema_Pagamento SHALL rejeitar a atualização, preservar o estado atual do Pedido e do Pagamento_Gateway e retornar uma indicação de erro sinalizando que o Pedido não está apto a receber confirmação de pagamento.
7. IF um Webhook autenticado reporta Estado_Cobranca `aprovado` sem que exista um Pagamento_Gateway correspondente ou um Pedido associado, THEN THE Sistema_Pagamento SHALL não alterar nenhum dado e retornar uma indicação de erro sinalizando que a cobrança referenciada não foi encontrada.

### Requisito 7: Tratamento de pagamentos rejeitados, cancelados e estornados

**User Story:** Como cliente, quero saber quando um pagamento não é concluído, para que eu possa tentar novamente ou escolher outro meio.

#### Critérios de Aceitação

1. WHEN um Webhook autenticado reporta Estado_Cobranca `rejeitado` para um Pagamento_Gateway existente, THE Sistema_Pagamento SHALL atualizar o Estado_Cobranca do Pagamento_Gateway para `rejeitado` e manter o `payment_status` do Pedido associado igual a `pendente`.
2. WHEN um Webhook autenticado reporta Estado_Cobranca `cancelado` para um Pagamento_Gateway existente, THE Sistema_Pagamento SHALL atualizar o Estado_Cobranca do Pagamento_Gateway para `cancelado` e manter o `payment_status` do Pedido associado igual a `pendente`.
3. WHEN um Webhook autenticado reporta Estado_Cobranca `estornado` para um Pagamento_Gateway cujo Pedido está `pago`, THE Sistema_Pagamento SHALL atualizar o Estado_Cobranca do Pagamento_Gateway para `estornado`, o `payment_status` do Pedido para `pendente` e limpar o `paid_at` do Pedido.
4. IF uma Cobranca com Estado_Cobranca `rejeitado`, `cancelado` ou `estornado` recebe nova solicitação de pagamento para o mesmo Pedido, THEN THE Sistema_Pagamento SHALL permitir a criação de uma nova Cobranca.
5. IF um Webhook autenticado reporta um Estado_Cobranca (`rejeitado`, `cancelado` ou `estornado`) idêntico ao Estado_Cobranca já registrado para o mesmo Pagamento_Gateway, THEN THE Sistema_Pagamento SHALL tratar a requisição de forma idempotente, mantendo o Estado_Cobranca e o `payment_status` do Pedido inalterados e retornando uma resposta de sucesso ao Webhook.
6. IF um Webhook autenticado referencia um Pagamento_Gateway inexistente ou não associado a nenhum Pedido, THEN THE Sistema_Pagamento SHALL rejeitar a requisição sem alterar qualquer Estado_Cobranca ou `payment_status`, retornando ao Webhook uma indicação de erro de que o Pagamento_Gateway não foi encontrado.

### Requisito 8: Consulta do estado do pagamento pelo cliente

**User Story:** Como cliente, quero acompanhar o estado do meu pagamento, para que eu saiba quando ele foi confirmado.

#### Critérios de Aceitação

1. WHEN o App_Cliente solicita o estado de um Pagamento_Gateway de um Pedido do Tenant, THE Sistema_Pagamento SHALL retornar em até 3 segundos o Estado_Cobranca atual dentre `pendente`, `aprovado`, `rejeitado`, `cancelado` ou `estornado`.
2. THE Sistema_Pagamento SHALL resolver o Pedido e o Pagamento_Gateway consultados exclusivamente dentro do Tenant informado.
3. IF a consulta referencia um Pedido inexistente no Tenant, THEN THE Sistema_Pagamento SHALL retornar erro `404` com mensagem em pt-BR indicando que o Pedido não foi encontrado, sem expor dados de outro Tenant.
4. THE Sistema_Pagamento SHALL omitir da resposta ao App_Cliente as Credenciais_Gateway e quaisquer segredos do Gateway.
5. IF a consulta referencia um Pedido existente no Tenant que ainda não possui Pagamento_Gateway associado, THEN THE Sistema_Pagamento SHALL retornar erro `404` com mensagem em pt-BR indicando que não há pagamento associado ao Pedido, sem expor dados de outro Tenant.
6. IF o identificador de Tenant está ausente ou inválido na consulta, THEN THE Sistema_Pagamento SHALL rejeitar a requisição com erro em pt-BR e não retornar nenhum Estado_Cobranca.

### Requisito 9: Escopo multi-tenant do pagamento

**User Story:** Como operador do sistema multi-tenant, quero que toda a operação de pagamento respeite os limites de tenant, para que cobranças e confirmações afetem apenas o estabelecimento correto.

#### Critérios de Aceitação

1. THE Sistema_Pagamento SHALL acessar Pedidos, Pagamentos_Gateway e Credenciais_Gateway exclusivamente por meio de `tenantRepository(tenantId)`.
2. WHEN uma Cobranca é criada, THE Sistema_Pagamento SHALL usar as Credenciais_Gateway do mesmo Tenant ao qual o Pedido pertence.
3. IF uma operação tenta vincular uma Cobranca ou um Webhook de um Tenant a um Pedido de outro Tenant, THEN THE Sistema_Pagamento SHALL recusar a operação antes de qualquer I/O, com indicação de erro e sem alterar nenhum Pedido ou Pagamento_Gateway.
4. WHEN um Webhook é processado, THE Sistema_Pagamento SHALL aplicar os efeitos somente a Pedidos e Pagamentos_Gateway do Tenant resolvido a partir da notificação.
5. IF o Tenant não pode ser resolvido, ou diverge do Tenant do Pedido referenciado, durante o processamento de um Webhook, THEN THE Sistema_Pagamento SHALL recusar a operação sem aplicar nenhum efeito ao Pedido ou ao Pagamento_Gateway.

### Requisito 10: Iniciar e acompanhar o pagamento no App_Cliente

**User Story:** Como cliente, quero iniciar o pagamento e ver as instruções (QR Code Pix ou cartão) na tela, para que eu consiga pagar o pedido pelo aplicativo.

#### Critérios de Aceitação

1. THE App_Cliente SHALL apresentar controles para o cliente escolher um Meio_Pagamento_Online e um controle de envio, cada um com `testID` e rótulos de acessibilidade, mantendo o controle de envio desabilitado enquanto nenhum Meio_Pagamento_Online estiver selecionado.
2. WHEN o cliente confirma o pagamento por `pix`, THE App_Cliente SHALL exibir o código copia-e-cola e a imagem do QR Code retornados pelo Sistema_Pagamento.
3. WHEN o cliente confirma o pagamento por `cartão crédito` ou `cartão débito`, THE App_Cliente SHALL apresentar o fluxo de pagamento por cartão a partir dos dados retornados pelo Sistema_Pagamento.
4. WHILE o Estado_Cobranca de um Pedido é `pendente`, THE App_Cliente SHALL exibir indicação de que o pagamento está aguardando confirmação.
5. WHEN o Estado_Cobranca de um Pedido passa a `aprovado`, THE App_Cliente SHALL exibir confirmação de que o pagamento foi aprovado.
6. IF o Estado_Cobranca de um Pedido é `rejeitado` ou `cancelado`, THEN THE App_Cliente SHALL exibir mensagem em pt-BR informando que o pagamento não foi concluído e oferecer a opção de tentar novamente.
7. IF a solicitação de criação de Cobranca falha, THEN THE App_Cliente SHALL exibir a mensagem de erro em pt-BR retornada pelo Sistema_Pagamento com `accessibilityRole="alert"`, sem expor detalhes internos.
8. WHILE a solicitação de criação de Cobranca está em andamento, THE App_Cliente SHALL exibir feedback de carregamento e impedir múltiplos envios simultâneos.

### Requisito 11: Tratamento de falhas na comunicação com o gateway

**User Story:** Como cliente, quero que falhas temporárias de comunicação com o Mercado Pago sejam tratadas com clareza, para que eu entenda o que ocorreu sem que o pedido fique em estado inconsistente.

#### Critérios de Aceitação

1. IF a chamada ao Gateway para criar uma Cobranca não retornar resposta em até 15 segundos, ou falhar por erro de comunicação, ou for recusada pelo Gateway, THEN THE Sistema_Pagamento SHALL retornar erro em pt-BR indicando que não foi possível iniciar o pagamento, sem persistir um Pagamento_Gateway em estado inconsistente.
2. IF a chamada ao Gateway para criar uma Cobranca falhar por erro de comunicação ou timeout, THEN THE Sistema_Pagamento SHALL repetir a chamada em até 2 tentativas adicionais (total máximo de 3 tentativas) antes de declarar a falha ao App_Cliente.
3. IF a chamada ao Gateway retorna resposta de erro de autenticação, THEN THE Sistema_Pagamento SHALL registrar a falha para diagnóstico interno e retornar ao App_Cliente um erro genérico em pt-BR indicando que não foi possível iniciar o pagamento, sem expor as Credenciais_Gateway nem a causa detalhada.
4. THE Sistema_Pagamento SHALL registrar as falhas de comunicação com o Gateway por meio do helper de log existente (`logError`), sem incluir segredos das Credenciais_Gateway no registro.
5. WHEN uma criação de Cobranca falha após ter sido persistido um Pagamento_Gateway `pendente`, THE Sistema_Pagamento SHALL manter o Pedido com `payment_status` igual a `pendente` e não alterar nenhum outro campo do Pedido.

### Requisito 12: Coexistência entre pagamento manual e pagamento online

**User Story:** Como operador, quero continuar registrando pagamentos manualmente (dinheiro, Pix na maquininha, cartão débito/crédito) mesmo com a integração online ativa, para que eu não perca o fluxo atual e não haja risco de cobrança dupla quando um pedido tem uma cobrança online em aberto.

#### Critérios de Aceitação

1. THE Sistema_Pagamento SHALL preservar o registro manual de pagamento existente, permitindo ao operador autenticado marcar um Pedido do próprio Tenant como `pago` informando um `payment_method` manual (`dinheiro`, `pix`, `cartão débito` ou `cartão crédito`), sem depender do Gateway.
2. WHEN o operador registra manualmente o pagamento de um Pedido que possui um Pagamento_Gateway com Estado_Cobranca `pendente`, THE Sistema_Pagamento SHALL marcar o Pedido como `pago` e tratar a Cobranca pendente de forma a não resultar em cobrança dupla, deixando a Cobranca pendente de ser considerada válida para confirmar o Pedido.
3. IF, após o registro manual, um Webhook autenticado reporta Estado_Cobranca `aprovado` para o Pagamento_Gateway daquele Pedido que já está `pago` por registro manual, THEN THE Sistema_Pagamento SHALL tratar o Webhook de forma idempotente, mantendo o Pedido com um único `paid_at` e `payment_status` igual a `pago`, sem sobrescrever o `payment_method` registrado manualmente e sem publicar efeito duplicado.
4. WHEN o registro manual marca um Pedido como `pago`, THE Sistema_Pagamento SHALL publicar os eventos em tempo real exatamente como no fluxo manual existente, preservando o comportamento atual.
5. IF o operador tenta registrar manualmente o pagamento de um Pedido que já está `pago` por qualquer caminho, manual ou online, THEN THE Sistema_Pagamento SHALL retornar erro `409` em pt-BR indicando que o pedido já foi pago, sem alterar o Pedido, preservando o comportamento já existente.
