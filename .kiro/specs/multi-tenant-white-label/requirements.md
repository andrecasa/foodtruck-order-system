# Requirements Document

## Introduction

Este documento especifica a transformação do MVP mono-cliente "Pastel das Meninas" em um produto **white-label multi-tenant**, permitindo o onboarding fácil e lucrativo de novos clientes (100 a 200 no primeiro ano) sobre uma única stack compartilhada.

O sistema atual é um monorepo pnpm com: `backend` (Express + TypeScript + `pg` Pool + PostgreSQL), `mobile` (app Expo/React Native do operador), `web` (painel do preparador em Vite/React) e `packages/shared` (tipos TypeScript + Zod + constantes). A autenticação usa Supabase GoTrue (JWT), o realtime usa Supabase Broadcast (canais `orders:queue` e `orders:payment`), e o bot de WhatsApp usa a Evolution API (instância única). O deploy é Docker Compose (stack única).

As decisões de arquitetura abaixo são **restrições fixas** deste projeto e não são reabertas nesta fase:

1. **Modelo de multi-tenancy = banco/stack único compartilhado** com uma coluna `tenant_id` em toda tabela com escopo de tenant. Não há deploy por cliente nem schema por tenant.
2. **Escala-alvo = 100 a 200 clientes no primeiro ano**, portanto o onboarding deve ser leve e self-service.
3. **Mobile e web = um único app publicado** nas lojas; branding e tema são aplicados por tenant **após o login**, resolvidos dinamicamente a partir do tenant do usuário autenticado. Não há build por cliente.
4. **Projeto greenfield (ainda não em produção)** — o schema já nasce multi-tenant (com `tenant_id` na primeira migração). Não há migração de dados, backfill nem preocupação com zero-downtime. "Pastel das Meninas" passa a ser apenas o primeiro tenant criado via onboarding. Como consequência, **as migrations devem ser reescritas/otimizadas para a criação do MVP do zero**, definindo o schema já em sua forma final multi-tenant, sem `ALTER TABLE` incrementais herdados do schema single-tenant anterior.
5. **Isolamento de dados = somente na camada de aplicação** (sem Row-Level Security do PostgreSQL). O isolamento depende de disciplina de código, imposta por um **helper centralizado de acesso a dados** que sempre injeta `tenant_id`. Nenhum controller monta SQL de tenant manualmente.

O objetivo funcional é preservar todo o comportamento existente do MVP (ciclo de vida de pedidos, pagamentos, CRUD de cardápio, gestão de usuários, resumo diário em `America/Sao_Paulo`, fila em tempo real e bot de WhatsApp), agora com escopo por tenant e sem vazamento de dados entre clientes.

## Glossary

- **Tenant (Cliente)**: Uma organização/negócio isolada dentro da stack compartilhada. Cada tenant possui seus próprios usuários, cardápio, pedidos, branding e configuração de WhatsApp, identificados por um `tenant_id` único.
- **Plataforma**: O produto white-label como um todo, compartilhado por todos os Tenants.
- **Platform_Admin (Administrador da Plataforma)**: O papel do proprietário do produto white-label, autorizado a criar, listar, configurar e gerenciar Tenants. Não pertence a um único Tenant.
- **Tenant_Admin (Administrador do Tenant)**: O papel de administrador dentro de um único Tenant (equivalente ao atual papel `admin`), autorizado a gerenciar apenas os dados do próprio Tenant (usuários, cardápio, categorias, pedidos, resumo).
- **Tenant_User (Usuário do Tenant)**: Qualquer usuário associado a exatamente um Tenant (papéis `admin`, `atendente` ou `preparador`).
- **Tenant-scoped (Com escopo de tenant)**: Propriedade de um dado ou operação de pertencer e estar restrito a um único Tenant.
- **Tenant_Resolution_Middleware (Middleware de Resolução de Tenant)**: Componente do backend que determina o `tenant_id` da requisição a partir do usuário autenticado (JWT/associação) e o disponibiliza ao restante do processamento.
- **Data_Access_Helper (Helper Centralizado de Acesso a Dados)**: Ponto único de imposição no backend que injeta `tenant_id` em toda consulta com escopo de tenant, garantindo isolamento sem que controllers montem SQL de tenant diretamente.
- **Branding_Service (Serviço de Branding)**: Componente do backend que expõe o branding e o tema (businessName, logo, tokens de cor/tipografia/espaçamento) do Tenant autenticado.
- **Theme_Provider (Provedor de Tema)**: Componente de front-end (web e mobile) que aplica em tempo de execução o tema recebido do backend.
- **Evolution_Instance (Instância Evolution)**: Uma conexão de WhatsApp na Evolution API, com número próprio, associada a exatamente um Tenant.
- **Webhook_Router (Roteador de Webhook)**: Componente do backend que direciona um webhook recebido da Evolution API ao Tenant correto.
- **WhatsApp_Bot (Bot de WhatsApp)**: O serviço de atendimento por WhatsApp, agora com sessões, cardápio e pedidos com escopo por Tenant.
- **Onboarding_Service (Serviço de Onboarding)**: Fluxo leve (script e/ou capacidade administrativa) que provisiona um novo Tenant sem alteração de código nem redeploy.
- **Tenant-scoped table (Tabela com escopo de tenant)**: Tabela que contém a coluna `tenant_id` e cujos registros pertencem a um único Tenant (`users`, `categories`, `menu_items`, `orders`, `order_items`, `daily_sequences`, `whatsapp_sessions`).

## Requirements

### Requirement 1: Modelo de Dados de Tenant

**User Story:** Como Administrador da Plataforma, quero um modelo de dados nativamente multi-tenant, para que os dados de cada cliente sejam armazenados de forma segregada dentro do banco compartilhado.

#### Acceptance Criteria

1. THE Plataforma SHALL manter uma tabela `tenants` na qual cada registro contém, no mínimo, os campos: identificador único (não nulo e único), nome do negócio (texto não nulo, de 1 a 120 caracteres), logo (referência de imagem, opcional), tema em formato JSON válido (opcional, com tamanho máximo de 16 KB), configuração da instância WhatsApp/Evolution em formato JSON válido (opcional), fuso horário (não nulo, string de identificador de fuso horário IANA, por exemplo `America/Sao_Paulo`) e status.
2. THE Plataforma SHALL restringir o campo status de um Tenant exclusivamente aos valores `ativo` e `inativo`, e definir seu valor padrão como `ativo` quando não informado na criação.
3. IF uma operação tentar gravar em um Tenant um valor de status diferente de `ativo` ou `inativo`, THEN THE Plataforma SHALL rejeitar a operação, preservar o registro existente sem alteração e retornar um erro indicando valor de status inválido.
4. THE Plataforma SHALL incluir a coluna `tenant_id` nas tabelas `users`, `categories`, `menu_items`, `orders`, `order_items`, `daily_sequences` e `whatsapp_sessions`, sendo estas as tabelas com escopo de tenant.
5. THE Plataforma SHALL declarar `tenant_id` como chave estrangeira referenciando o identificador único da tabela `tenants` em cada tabela com escopo de tenant.
6. IF uma operação tentar inserir ou atualizar um registro em uma tabela com escopo de tenant com um `tenant_id` que não corresponde a nenhum registro existente na tabela `tenants`, THEN THE Plataforma SHALL rejeitar a operação e retornar um erro indicando violação de integridade referencial, sem persistir o registro.
7. THE Plataforma SHALL definir `tenant_id` como coluna obrigatória (não nula) em cada tabela com escopo de tenant.
8. IF uma operação tentar inserir ou atualizar um registro em uma tabela com escopo de tenant com `tenant_id` nulo, THEN THE Plataforma SHALL rejeitar a operação e retornar um erro indicando que `tenant_id` é obrigatório, sem persistir o registro.
9. WHEN a primeira migração de schema é executada com sucesso, THE Plataforma SHALL criar as tabelas com escopo de tenant já contendo a coluna `tenant_id` não nula e a respectiva chave estrangeira para a tabela `tenants`.
10. IF a execução da primeira migração de schema falhar, THEN THE Plataforma SHALL reverter todas as alterações da migração, mantendo o schema no estado anterior à execução, e retornar um erro indicando a falha da migração.
11. THE conjunto de migrations SHALL ser otimizado para a criação do MVP do zero, definindo cada tabela com escopo de tenant já em sua forma final multi-tenant (com `tenant_id`, chaves estrangeiras e restrições de unicidade compostas) no momento de sua criação, sem depender de `ALTER TABLE` incrementais para adicionar `tenant_id`, chaves estrangeiras ou restrições compostas.
12. THE conjunto de migrations SHALL criar a tabela `tenants` antes de qualquer tabela com escopo de tenant que a referencie, garantindo a ordem de dependência das chaves estrangeiras em uma execução limpa a partir de um banco vazio.
13. THE conjunto de migrations SHALL NOT conter passos cuja única finalidade seja migrar, transformar ou preencher (backfill) dados de um schema single-tenant anterior.
14. WHEN as migrations são executadas a partir de um banco de dados vazio, THE Plataforma SHALL produzir o schema multi-tenant completo e válido sem exigir intervenção manual adicional.

### Requirement 2: Unicidade Composta por Tenant

**User Story:** Como Administrador do Tenant, quero que as regras de unicidade se apliquem dentro do meu tenant, para que meus dados não conflitem com os de outros clientes nem sofram restrições indevidas por causa deles.

#### Acceptance Criteria

1. THE Plataforma SHALL impor unicidade do par (`tenant_id`, `email`) na tabela `users`, comparando o valor de `email` de forma case-insensitive e sem espaços em branco nas extremidades.
2. THE Plataforma SHALL impor unicidade do par (`tenant_id`, `name`) na tabela `categories`, comparando o valor de `name` de forma case-insensitive e sem espaços em branco nas extremidades.
3. THE Plataforma SHALL impor unicidade do nome de item de cardápio cujo status seja ativo dentro do escopo de um mesmo `tenant_id`, permitindo nomes iguais entre um item ativo e um ou mais itens inativos no mesmo tenant.
4. THE Plataforma SHALL impor unicidade do trio (`tenant_id`, `order_date`, `daily_number`) na tabela `orders`.
5. WHEN um mesmo valor de e-mail é cadastrado em dois `tenant_id` distintos, THE Plataforma SHALL aceitar ambos os cadastros e persistir os dois registros.
6. IF um cadastro viola uma restrição de unicidade composta dentro do mesmo `tenant_id`, THEN THE Plataforma SHALL rejeitar o cadastro, não persistir nem alterar nenhum registro existente, e retornar uma mensagem de erro que identifique o campo em conflito e o valor duplicado.

### Requirement 3: Numeração Diária de Pedidos por Tenant

**User Story:** Como Administrador do Tenant, quero que os números diários dos pedidos sejam sequenciais dentro do meu tenant, para que a numeração exibida aos clientes seja independente do movimento de outros clientes.

#### Acceptance Criteria

1. THE Plataforma SHALL manter a sequência de numeração diária de pedidos com escopo por `tenant_id` e por `order_date`.
2. WHEN um pedido é criado para um Tenant em uma data, THE Plataforma SHALL atribuir o próximo número diário sequencial daquele Tenant naquela data, incrementando em exatamente 1 o maior número diário já atribuído àquele Tenant naquela data.
3. THE função `next_daily_number` SHALL receber o `tenant_id` e a `order_date` como parâmetros e retornar o próximo número no escopo daquele Tenant e daquela data.
4. WHEN o primeiro pedido de um Tenant em uma data é criado, THE Plataforma SHALL atribuir o número diário 1.
5. WHERE dois Tenants criam pedidos na mesma data, THE Plataforma SHALL manter contadores diários independentes por Tenant, sem que a numeração de um Tenant influencie a de outro.
6. WHEN uma nova `order_date` inicia para um Tenant, THE Plataforma SHALL reiniciar a sequência diária daquele Tenant em 1, independentemente do último número atribuído em datas anteriores.
7. WHEN pedidos concorrentes são criados para o mesmo Tenant e data, THE Plataforma SHALL atribuir números diários únicos e consecutivos, sem duplicação e sem lacunas causadas por concorrência.
8. IF a função `next_daily_number` é invocada sem um `tenant_id` válido, THEN THE Plataforma SHALL rejeitar a operação e não atribuir número diário.

### Requirement 4: Resolução de Tenant por Requisição

**User Story:** Como desenvolvedor da Plataforma, quero que cada requisição autenticada resolva seu tenant automaticamente, para que todas as operações sejam corretamente vinculadas ao cliente do usuário.

#### Acceptance Criteria

1. THE Plataforma SHALL associar cada Tenant_User a exatamente um Tenant, rejeitando qualquer tentativa de criação ou atualização de Tenant_User que resulte em zero ou mais de um Tenant associado.
2. WHEN uma requisição autenticada é recebida, THE Tenant_Resolution_Middleware SHALL determinar o `tenant_id` a partir do identificador de Tenant contido nas credenciais do usuário autenticado, concluindo a resolução em até 200 milissegundos.
3. WHEN o `tenant_id` é resolvido, THE Tenant_Resolution_Middleware SHALL disponibilizá-lo ao restante do processamento da requisição por meio do contexto da requisição, de forma acessível a todas as camadas subsequentes.
4. IF o usuário autenticado não possui exatamente um Tenant associado, THEN THE Tenant_Resolution_Middleware SHALL rejeitar a requisição com status HTTP 403, retornar uma mensagem de erro indicando ausência de Tenant associado e não executar nenhuma operação de negócio da requisição.
5. IF o Tenant resolvido possui status diferente de `ativo`, THEN THE Tenant_Resolution_Middleware SHALL rejeitar a requisição com status HTTP 403, retornar uma mensagem de erro indicando que o Tenant está inativo e não executar nenhuma operação de negócio da requisição.
6. WHEN o Tenant é resolvido com sucesso, THE Plataforma SHALL escopar todas as consultas de leitura e escrita da requisição ao `tenant_id` resolvido, garantindo que nenhum registro pertencente a outro `tenant_id` seja lido ou modificado.
7. IF o `tenant_id` não pode ser determinado a partir das credenciais do usuário autenticado, THEN THE Tenant_Resolution_Middleware SHALL rejeitar a requisição com status HTTP 401 e retornar uma mensagem de erro indicando falha na resolução do Tenant.

### Requirement 5: Helper Centralizado de Acesso a Dados

**User Story:** Como desenvolvedor da Plataforma, quero um único ponto de acesso a dados que sempre injete o tenant, para que o isolamento entre clientes seja garantido por construção e não por disciplina espalhada em cada controller.

#### Acceptance Criteria

1. THE Data_Access_Helper SHALL injetar o `tenant_id` da requisição em toda consulta com escopo de tenant.
2. WHEN uma leitura é executada por meio do Data_Access_Helper e não há registros correspondentes ao Tenant resolvido, THE Data_Access_Helper SHALL retornar um resultado vazio, e não um erro.
3. WHEN uma leitura é executada por meio do Data_Access_Helper, THE Data_Access_Helper SHALL retornar apenas registros cujo `tenant_id` corresponde ao Tenant resolvido.
4. WHEN uma escrita é executada por meio do Data_Access_Helper, THE Data_Access_Helper SHALL persistir o registro com o `tenant_id` do Tenant resolvido.
5. WHEN uma atualização ou exclusão é executada por meio do Data_Access_Helper, THE Data_Access_Helper SHALL restringir a operação exclusivamente a registros cujo `tenant_id` corresponde ao Tenant resolvido, sem afetar registros de outros Tenants.
6. THE controllers e serviços de domínio SHALL acessar dados com escopo de tenant exclusivamente por meio do Data_Access_Helper.
7. IF uma operação com escopo de tenant é solicitada sem um `tenant_id` resolvido, THEN THE Data_Access_Helper SHALL rejeitar a operação, não ler nem modificar nenhum registro, e sinalizar um erro indicando ausência de contexto de Tenant.

### Requirement 6: Garantias de Isolamento entre Tenants

**User Story:** Como Administrador do Tenant, quero que os dados do meu cliente sejam inacessíveis a outros clientes, para que a confidencialidade e a integridade das informações sejam preservadas.

#### Acceptance Criteria

1. WHEN um usuário do Tenant A solicita a leitura ou a listagem de dados, THE Plataforma SHALL retornar exclusivamente registros cujo `tenant_id` é igual ao do Tenant A.
2. IF a requisição não possui um contexto de Tenant resolvido, THEN THE Plataforma SHALL rejeitar a operação sem ler nem modificar dados.
3. IF um usuário do Tenant A solicita a leitura de um registro pertencente ao Tenant B, THEN THE Plataforma SHALL responder como se o registro não existisse, com status HTTP 404, sem revelar a existência do registro.
4. IF um usuário do Tenant A solicita a modificação ou exclusão de um registro pertencente ao Tenant B, THEN THE Plataforma SHALL rejeitar a operação, preservar o registro do Tenant B sem qualquer alteração, e responder com status HTTP 404.
5. THE Plataforma SHALL aplicar o isolamento por tenant, em operações de leitura, listagem, escrita, atualização e exclusão, a pedidos, itens de pedido, cardápio, categorias, usuários, resumo diário e sessões de WhatsApp.
6. FOR ALL operações com escopo de tenant, um usuário SHALL acessar somente registros cujo `tenant_id` é igual ao Tenant a que o usuário está associado.

### Requirement 7: Branding e Tema por Tenant Aplicados Após o Login

**User Story:** Como Administrador do Tenant, quero que o app exiba a identidade visual do meu negócio após o login, para que meus operadores usem um produto com a minha marca sem builds dedicados.

#### Acceptance Criteria

1. WHEN um usuário autentica com sucesso, THE Branding_Service SHALL fornecer o businessName, o logo e o tema (tokens de cor, tipografia e espaçamento) do Tenant do usuário.
2. WHEN o front-end recebe o branding do Tenant, THE Theme_Provider SHALL aplicar o tema em tempo de execução antes de renderizar as telas autenticadas, sem exibir as telas autenticadas com o tema anterior.
3. THE app web SHALL obter o branding do Tenant autenticado a partir do backend.
4. THE app mobile SHALL obter o branding do Tenant autenticado a partir do backend.
5. THE app mobile SHALL aplicar o tema recebido do backend, substituindo o tema padrão embutido, sem exigir um novo build do aplicativo.
6. THE Plataforma SHALL obter businessName, logo e tema de fontes de dados do Tenant, sem valores fixos no código.
7. WHEN o Branding_Service fornece o branding após a autenticação, THE Branding_Service SHALL concluir a resposta em até 2 segundos.
8. IF a obtenção do branding do Tenant falhar ou exceder o tempo limite, THEN THE Theme_Provider SHALL aplicar o tema padrão neutro da Plataforma e permitir o uso do app.

### Requirement 8: WhatsApp por Tenant

**User Story:** Como Administrador do Tenant, quero que meu WhatsApp use meu próprio número e meu cardápio, para que os pedidos recebidos sejam atribuídos corretamente ao meu negócio.

#### Acceptance Criteria

1. THE Plataforma SHALL associar a cada Tenant exatamente uma Evolution_Instance e exatamente um número de WhatsApp, garantindo que a mesma Evolution_Instance não esteja associada a mais de um Tenant.
2. WHEN um webhook da Evolution API é recebido, THE Webhook_Router SHALL identificar o Tenant cuja Evolution_Instance associada corresponde ao identificador de instância presente no payload do evento.
3. IF um webhook recebido contém um identificador de instância que não corresponde a nenhuma Evolution_Instance associada a um Tenant, THEN THE Webhook_Router SHALL ignorar o evento, não criar nem alterar dados, e responder com status HTTP 200.
4. IF um webhook recebido não contém identificador de instância ou contém payload malformado, THEN THE Webhook_Router SHALL rejeitar o evento, não criar nem alterar dados, e responder com status HTTP 200.
5. IF ocorre um erro interno durante o processamento de um webhook recebido, THEN THE Webhook_Router SHALL não persistir dados parciais referentes a esse evento e responder com status HTTP 200.
6. WHEN um webhook válido é recebido, THE Webhook_Router SHALL concluir o processamento e responder com status HTTP 200 em até 10 segundos.
7. THE Plataforma SHALL escopar as `whatsapp_sessions` por `tenant_id`, permitindo que um mesmo `phone_number` exista simultaneamente em até um registro por Tenant distinto.
8. WHEN o WhatsApp_Bot cria um pedido a partir de uma conversa, THE Plataforma SHALL atribuir o pedido ao `tenant_id` da sessão de origem e a um administrador com status ativo pertencente a esse mesmo Tenant.
9. IF, ao criar um pedido a partir de uma conversa, não existir nenhum administrador com status ativo pertencente ao Tenant de origem, THEN THE Plataforma SHALL não criar o pedido e registrar uma indicação de falha informando a ausência de administrador ativo.
10. WHEN o WhatsApp_Bot monta a saudação e o cardápio de uma conversa, THE WhatsApp_Bot SHALL utilizar o cardápio marcado como ativo do Tenant correspondente à sessão.
11. WHILE uma sessão de WhatsApp de um Tenant está ativa, THE WhatsApp_Bot SHALL processar as mensagens dessa sessão consultando e persistindo exclusivamente dados cujo `tenant_id` seja igual ao da sessão.

### Requirement 9: Onboarding e Provisionamento de Tenant

**User Story:** Como Administrador da Plataforma, quero provisionar um novo cliente por um fluxo leve, para que eu possa adicionar clientes sem alterar código nem fazer redeploy.

#### Acceptance Criteria

1. THE Onboarding_Service SHALL criar um novo Tenant com nome do negócio, branding e tema iniciais.
2. THE Onboarding_Service SHALL popular um cardápio inicial (categorias e itens) para o novo Tenant.
3. THE Onboarding_Service SHALL provisionar exatamente um usuário administrador ativo para o novo Tenant.
4. THE Onboarding_Service SHALL registrar a configuração da instância de WhatsApp do novo Tenant.
5. WHEN um novo Tenant é provisionado, THE Onboarding_Service SHALL concluir a operação sem exigir alteração de código nem redeploy da stack.
6. THE Plataforma SHALL tratar o cardápio inicial da "Pastel das Meninas" como dado de onboarding de um Tenant, e não como migração global de schema.
7. IF o provisionamento de um Tenant falha em qualquer etapa, THEN THE Onboarding_Service SHALL reverter as etapas já concluídas dessa operação, de modo que nenhum Tenant parcialmente criado permaneça em estado utilizável, e sinalizar o erro.
8. IF os dados de entrada do provisionamento são inválidos ou incompletos (por exemplo, nome do negócio ausente ou dados de administrador ausentes), THEN THE Onboarding_Service SHALL rejeitar a operação antes de criar qualquer registro e retornar um erro identificando os campos inválidos.
9. WHEN o mesmo pedido de provisionamento é reenviado após uma falha, THE Onboarding_Service SHALL evitar a criação de Tenants duplicados para o mesmo identificador de provisionamento.

### Requirement 10: Papéis de Administrador da Plataforma e do Tenant

**User Story:** Como Administrador da Plataforma, quero distinguir quem gerencia clientes de quem gerencia dados de um único cliente, para que o controle de acesso reflita as responsabilidades corretas.

#### Acceptance Criteria

1. THE Plataforma SHALL distinguir o papel Platform_Admin do papel Tenant_Admin.
2. WHILE o usuário autenticado é um Platform_Admin, THE Plataforma SHALL autorizar a criação, listagem e gestão de Tenants.
3. WHILE o usuário autenticado é um Tenant_Admin, THE Plataforma SHALL autorizar a gestão exclusivamente dos dados do próprio Tenant.
4. IF um Tenant_Admin ou Tenant_User solicita uma operação de gestão de Tenants, THEN THE Plataforma SHALL rejeitar a operação com status HTTP 403 e não executar a operação.
5. IF um Tenant_User solicita dados ou operações de outro Tenant, THEN THE Plataforma SHALL rejeitar a operação com status HTTP 403 para operações de gestão explicitamente vinculadas a outro Tenant, ou HTTP 404 para acesso a registros de outro Tenant, sem alterar nenhum dado.
6. WHEN um Platform_Admin lista Tenants, THE Plataforma SHALL retornar os Tenants da Plataforma; e WHEN um Tenant_User lista dados de negócio, THE Plataforma SHALL excluir do resultado quaisquer registros pertencentes a outros Tenants.
7. WHEN uma operação de gestão de Tenants é executada por um Platform_Admin, THE Plataforma SHALL registrar uma trilha de auditoria contendo o identificador do ator e a operação realizada.

### Requirement 11: Remoção de Valores Fixos Específicos de Cliente

**User Story:** Como Administrador da Plataforma, quero que nenhum valor específico de um cliente fique embutido no código, para que o mesmo build sirva a qualquer Tenant.

#### Acceptance Criteria

1. THE app mobile SHALL exibir, como nome do aplicativo no `app.json`, um valor de branding padrão da Plataforma que não contenha nenhum nome, marca ou identificador pertencente a um Tenant específico.
2. THE app web SHALL exibir, no elemento `<title>` do `index.html`, um valor de branding padrão da Plataforma que não contenha nenhum nome, marca ou identificador pertencente a um Tenant específico.
3. WHEN um Tenant é autenticado, THE Plataforma SHALL derivar businessName, logo e tema a partir dos dados de branding desse Tenant, e não dos valores definidos em `theme.config.ts`.
4. THE configuração de deploy SHALL utilizar, para domínio e e-mail de administrador, apenas valores genéricos ou parametrizados por variável de ambiente, sem conter nome, marca ou identificador pertencente a um Tenant específico.
5. WHERE um valor de branding (businessName, logo ou tema) não é fornecido por um Tenant, THE Plataforma SHALL aplicar o valor de branding padrão da Plataforma correspondente àquele atributo.
6. WHILE nenhum Tenant está autenticado, THE Plataforma SHALL exibir o branding padrão da Plataforma dentro de 1 segundo após o carregamento inicial da aplicação.
7. IF a derivação do branding do Tenant autenticado falhar, THEN THE Plataforma SHALL aplicar o branding padrão da Plataforma e registrar uma indicação de erro, sem interromper o carregamento da aplicação.

### Requirement 12: Compatibilidade Comportamental Dentro de um Tenant

**User Story:** Como Administrador do Tenant, quero que todas as funcionalidades atuais continuem funcionando dentro do meu tenant, para que a experiência do MVP seja preservada.

#### Acceptance Criteria

1. WHEN um pedido percorre o ciclo de vida dentro de um Tenant, THE Plataforma SHALL permitir apenas as transições de status `aguardando` → `preparando` → `pronto` → `entregue`, escopadas ao `tenant_id` do pedido.
2. IF uma transição de status fora da sequência permitida é solicitada, THEN THE Plataforma SHALL rejeitar a operação, preservar o status atual do pedido e retornar um erro indicando transição inválida.
3. WHEN um pagamento é registrado dentro de um Tenant, THE Plataforma SHALL aplicar as regras de pagamento (método e valor) do MVP, associando o pagamento a um pedido do mesmo `tenant_id`.
4. WHEN operações de CRUD de cardápio e categorias são realizadas dentro de um Tenant, THE Plataforma SHALL aplicar as regras do MVP, escopadas ao `tenant_id`.
5. WHEN a gestão de usuários é realizada dentro de um Tenant, THE Plataforma SHALL aplicar as regras do MVP, escopadas ao `tenant_id`.
6. WHEN o resumo diário é calculado dentro de um Tenant, THE Plataforma SHALL agregar exclusivamente os pedidos daquele `tenant_id` cujo `order_date` corresponde ao dia corrente no fuso horário `America/Sao_Paulo`.
7. THE Plataforma SHALL nomear os canais de realtime incluindo o identificador do Tenant, de modo que os canais de um Tenant sejam distintos dos de qualquer outro Tenant.
8. WHEN um evento de realtime é publicado para um Tenant, THE Plataforma SHALL entregá-lo apenas aos assinantes do canal daquele Tenant.
9. IF um assinante tenta se inscrever em um canal de realtime de um Tenant ao qual não está associado, THEN THE Plataforma SHALL negar a inscrição e não entregar eventos desse canal ao assinante.
10. WHEN qualquer operação de negócio deste requisito é solicitada sem um contexto de Tenant resolvido, THE Plataforma SHALL rejeitar a operação sem alterar dados.
