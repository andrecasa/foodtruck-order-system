# Requirements Document

## Introduction

Esta feature adiciona um mecanismo REAL de entrega de e-mail ao backend do sistema de pedidos. Hoje os e-mails não são de fato enviados: a feature de recuperação de senha (forgot-password) introduziu a abstração `EmailService` com apenas provedores placeholder (`NoopEmailProvider`, que descarta a mensagem; `LoggingEmailProvider`, que apenas registra em log), selecionados pela variável de ambiente `EMAIL_PROVIDER`. Como consequência, os códigos de verificação nunca chegam à caixa de entrada dos usuários.

O objetivo é adicionar um novo provedor de e-mail baseado em SMTP genérico (via `nodemailer`), que se conecta a qualquer servidor SMTP (Gmail, Zoho, self-hosted, etc.) e realmente entrega as mensagens. Esse novo provedor é selecionado por `EMAIL_PROVIDER=smtp` e implementa o contrato `EmailProvider` já existente (`send(message): Promise<void>` — uma tentativa por chamada, lançando erro em falha), de forma que toda a orquestração de retry e envio assíncrono já construída em `RetryingEmailService` continue válida sem alterações.

O escopo respeita as restrições e convenções já existentes no monorepo: a configuração vem da `.env` da raiz (carregada via `--env-file=../../.env` nos scripts do `apps/backend` e via `docker-compose` no container), tratamento de erros no estilo `ServiceError`, mensagens em pt-BR e módulos ESM com sufixo `.js` nos imports. Esta é uma feature de backend/infraestrutura: NÃO há nova interface de usuário.

Além da entrega SMTP, esta feature adiciona **envio multipart** do e-mail de verificação: uma versão em **HTML** (renderizada a partir de um arquivo de template `.html` com placeholders) e uma versão em **texto puro** como fallback. O `nodemailer` envia ambas as partes (`html` + `text`), e clientes de e-mail que não renderizam HTML recaem no texto. A versão HTML usa um layout genérico da plataforma — **sem** branding por tenant.

Para suportar HTML sem redesenhar de forma invasiva o contrato compartilhado, a `EmailMessage` recebe um campo **opcional** `html?: string` (extensão retrocompatível: provedores `Noop`/`Logging` e mensagens somente-texto continuam funcionando sem alteração). O `EmailService` passa a montar a mensagem de verificação com o `body` (texto, via `buildVerificationBody` existente) **e** o `html` (renderizado a partir do template). Assim, as assinaturas dos métodos de `EmailProvider`/`EmailService` permanecem estáveis; apenas a estrutura de dados `EmailMessage` ganha um campo opcional.

O escopo NÃO redesenha a abstração `EmailService`, o contrato `EmailProvider` nem o `RetryingEmailService`. Esses componentes permanecem com as mesmas assinaturas de método; a única mudança estrutural é o acréscimo do campo opcional `html?: string` à `EmailMessage`. A validação da entrega real é feita apontando a Configuracao_SMTP para um provedor SMTP real (por exemplo Gmail com uma senha de app, ou outro provedor real), bastando ajustar as variáveis de ambiente SMTP — sem necessidade de alteração de código.

## Glossary

- **Provedor_SMTP**: Nova implementação do contrato `EmailProvider` que entrega mensagens de e-mail através de um servidor SMTP configurado, utilizando a biblioteca `nodemailer`.
- **EmailProvider**: Contrato existente (`apps/backend/src/services/email/email.service.ts`) com o método `send(message): Promise<void>`, que executa exatamente UMA tentativa de envio e lança erro em caso de falha.
- **EmailService / RetryingEmailService**: Componentes existentes que orquestram o envio assíncrono (fire-and-forget) e o retry (até 3 tentativas, com intervalo mínimo de 2 segundos entre elas). NÃO são alterados por esta feature.
- **EmailMessage**: Estrutura montada pelo `EmailService` para o e-mail de verificação, com os campos `to`, `subject`, `body` (corpo em texto puro) e, adicionalmente, o campo **opcional** `html?: string` (corpo em HTML). Quando `html` está presente, o Provedor_SMTP envia a mensagem em formato multipart (HTML + texto); quando ausente, o envio é somente-texto (comportamento anterior preservado).
- **Template_Email**: Arquivo `.html` (sugerido: `apps/backend/src/services/email/templates/verification-code.html`) que define o layout genérico da plataforma para o e-mail de verificação, contendo placeholders (`{{code}}`, `{{expiresInMinutes}}`) substituídos em tempo de renderização.
- **Renderizador_Email**: Função do módulo de e-mail que lê o Template_Email, substitui os placeholders por valores escapados e produz o corpo HTML final, junto com o corpo em texto puro correspondente.
- **EMAIL_PROVIDER**: Variável de ambiente que seleciona o provedor de e-mail. Valores existentes: `noop`, `logging`. Esta feature adiciona o valor `smtp`.
- **Configuracao_SMTP**: Conjunto de variáveis de ambiente que descrevem a conexão SMTP: `SMTP_HOST` (host), `SMTP_PORT` (porta), `SMTP_USER` (usuário), `SMTP_PASS` (senha), `SMTP_FROM` (remetente/from) e `SMTP_SECURE` (uso de conexão segura/TLS).
- **Senha_De_App (app password)**: Senha específica gerada pelo provedor de e-mail (ex.: Gmail com verificação em duas etapas) para autenticação SMTP de aplicações, usada no lugar da senha principal da conta.
- **resolveEmailProvider**: Função existente que, a partir de `EMAIL_PROVIDER`, retorna a instância de `EmailProvider` correspondente. Esta feature acrescenta o caso `smtp` ao seu switch.
- **ServiceError**: Padrão de erro do backend, com `statusCode` e `code`, usado para sinalizar falhas de forma consistente.
- **Ambiente_Producao**: Execução com `NODE_ENV=production`.

## Requirements

### Requisito 1: Seleção do provedor SMTP por variável de ambiente

**User Story:** Como operador do sistema, quero selecionar o provedor de e-mail SMTP através de `EMAIL_PROVIDER=smtp`, para que os e-mails transacionais passem a ser entregues de verdade sem alterar código.

#### Critérios de Aceitação

1. WHEN a variável `EMAIL_PROVIDER` tem o valor "smtp" (sem diferenciar maiúsculas de minúsculas), THE resolveEmailProvider SHALL retornar uma instância de Provedor_SMTP.
2. WHEN a variável `EMAIL_PROVIDER` tem o valor "noop" ou está ausente ou vazia, THE resolveEmailProvider SHALL retornar a instância de NoopEmailProvider, mantendo o comportamento atual.
3. WHEN a variável `EMAIL_PROVIDER` tem o valor "logging", THE resolveEmailProvider SHALL retornar a instância de LoggingEmailProvider, mantendo o comportamento atual.
4. IF a variável `EMAIL_PROVIDER` tem um valor não reconhecido, THEN THE resolveEmailProvider SHALL retornar a instância de NoopEmailProvider e registrar um aviso interno, mantendo o comportamento atual.

### Requisito 2: Configuração da conexão SMTP por variáveis de ambiente

**User Story:** Como operador do sistema, quero configurar a conexão SMTP por variáveis de ambiente, para que a mesma imagem do backend funcione com qualquer servidor SMTP (Gmail, Zoho, self-hosted) apenas trocando a configuração.

#### Critérios de Aceitação

1. THE Provedor_SMTP SHALL obter a Configuracao_SMTP a partir das variáveis de ambiente `SMTP_HOST` (host), `SMTP_PORT` (porta), `SMTP_USER` (usuário), `SMTP_PASS` (senha), `SMTP_FROM` (remetente/from) e `SMTP_SECURE` (uso de conexão segura/TLS).
2. WHEN `EMAIL_PROVIDER` é "smtp" e todas as variáveis obrigatórias da Configuracao_SMTP estão presentes e válidas, THE Provedor_SMTP SHALL inicializar com sucesso usando os valores informados.
3. IF `EMAIL_PROVIDER` é "smtp" e uma ou mais variáveis obrigatórias da Configuracao_SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) estão ausentes, incompletas ou inválidas, THEN THE Provedor_SMTP SHALL falhar de forma explícita e imediata na inicialização (fail-fast), lançando um erro que impede o backend de subir, sem cair silenciosamente no NoopEmailProvider.
4. WHERE `SMTP_SECURE` está habilitada, THE Provedor_SMTP SHALL estabelecer a conexão SMTP em modo seguro (TLS implícito) conforme essa configuração.
5. IF a porta informada em `SMTP_PORT` é inválida (não numérica ou fora da faixa de portas válidas de 1 a 65535), THEN THE Provedor_SMTP SHALL falhar de forma explícita e imediata na inicialização (fail-fast) com mensagem em pt-BR.

### Requisito 3: Envio de mensagem via SMTP (contrato EmailProvider)

**User Story:** Como mantenedor do backend, quero que o Provedor_SMTP respeite o contrato `EmailProvider`, para que a orquestração de retry e envio assíncrono já existente continue funcionando sem alterações.

#### Critérios de Aceitação

1. WHEN o método `send` do Provedor_SMTP é chamado com uma EmailMessage válida, THE Provedor_SMTP SHALL realizar exatamente uma tentativa de entrega através do servidor SMTP configurado.
2. WHEN o servidor SMTP aceita a mensagem, THE Provedor_SMTP SHALL concluir a chamada `send` com sucesso (resolvendo a Promise sem lançar erro).
3. IF o servidor SMTP recusa a mensagem ou a conexão falha, THEN THE Provedor_SMTP SHALL lançar um erro a partir da chamada `send`, para que a política de retry existente seja acionada.
4. THE Provedor_SMTP SHALL usar os campos `to`, `subject` e `body` da EmailMessage e o remetente (from) definido na Configuracao_SMTP para compor a mensagem enviada.
5. WHEN o campo `html` da EmailMessage está presente e não vazio, THE Provedor_SMTP SHALL incluir a parte HTML na mensagem enviada (mapeando `body` para o texto puro e `html` para o conteúdo HTML), produzindo uma mensagem multipart.
6. WHEN o campo `html` da EmailMessage está ausente, THE Provedor_SMTP SHALL enviar a mensagem somente com o corpo em texto puro, preservando o comportamento anterior.

### Requisito 4: Entrega real do e-mail de verificação

**User Story:** Como usuário que solicitou a recuperação de senha, quero receber de fato o e-mail com o código de verificação, para que eu consiga concluir a redefinição da senha.

#### Critérios de Aceitação

1. WHEN o EmailService solicita o envio do código de verificação e `EMAIL_PROVIDER` é "smtp", THE Provedor_SMTP SHALL entregar ao servidor SMTP configurado a mensagem com o assunto, o corpo em texto puro e o corpo HTML já definidos pelo EmailService.
2. THE Provedor_SMTP SHALL preservar integralmente o conteúdo do corpo em texto (`body`), do corpo HTML (`html`) e do assunto (`subject`) fornecidos pelo EmailService, sem removê-los nem alterá-los.
3. WHEN o servidor SMTP aceita a mensagem do código de verificação, THE Provedor_SMTP SHALL considerar a tentativa como bem-sucedida perante o RetryingEmailService.
4. WHEN o EmailService monta o e-mail de verificação, THE EmailService SHALL produzir tanto o corpo em texto puro (via `buildVerificationBody`) quanto o corpo HTML (via Renderizador_Email a partir do Template_Email), garantindo que a versão em texto puro esteja SEMPRE presente como fallback.
5. THE Renderizador_Email SHALL substituir o placeholder `{{code}}` pelo Codigo_Verificacao e o placeholder `{{expiresInMinutes}}` pelo valor 15, de modo que o e-mail renderizado (tanto em texto quanto em HTML) contenha o código e a indicação de expiração em 15 minutos.
6. THE Renderizador_Email SHALL aplicar escaping de HTML aos valores substituídos nos placeholders antes de inseri-los no corpo HTML, de modo que caracteres especiais de HTML nos valores não sejam interpretados como marcação.

### Requisito 5: Compatibilidade retroativa com provedores existentes

**User Story:** Como mantenedor do backend, quero que os provedores `noop` e `logging` continuem funcionando, para que ambientes atuais não sejam afetados pela introdução do SMTP.

#### Critérios de Aceitação

1. THE resolveEmailProvider SHALL continuar aceitando os valores "noop" e "logging" de `EMAIL_PROVIDER` com o mesmo comportamento anterior a esta feature.
2. WHEN `EMAIL_PROVIDER` não é definido, THE resolveEmailProvider SHALL manter o NoopEmailProvider como padrão, preservando o comportamento atual.
3. THE introdução do Provedor_SMTP e do envio multipart SHALL manter estáveis as assinaturas de método de `EmailProvider` (`send(message): Promise<void>`), de `EmailService` (`sendVerificationCode(...)`) e a assinatura pública de `resolveEmailProvider`, admitindo como única alteração estrutural retrocompatível o acréscimo do campo **opcional** `html?: string` à `EmailMessage` — extensão que não quebra provedores nem chamadas existentes (mensagens sem `html` continuam válidas).

### Requisito 6: Segurança das credenciais e do conteúdo sensível

**User Story:** Como responsável pela segurança, quero que credenciais SMTP e códigos de verificação nunca vazem em logs, para que dados sensíveis não fiquem expostos em ambientes de execução.

#### Critérios de Aceitação

1. THE Provedor_SMTP SHALL registrar logs de operação e de erro sem incluir o valor de `SMTP_PASS` nem qualquer credencial da Configuracao_SMTP.
2. WHILE em Ambiente_Producao, THE Provedor_SMTP SHALL registrar logs de operação e de erro sem incluir o corpo da mensagem nem o código de verificação.
3. IF ocorre um erro de SMTP durante o envio, THEN THE Provedor_SMTP SHALL registrar internamente informações de diagnóstico suficientes para investigação sem incluir credenciais nem o código de verificação.
4. THE Provedor_SMTP SHALL restringir o conteúdo registrado sobre destinatário e assunto ao mínimo necessário para diagnóstico, mantendo consistência com o comportamento de log já adotado pelos provedores existentes.
5. WHILE em Ambiente_Producao, THE Provedor_SMTP SHALL registrar logs sem incluir o corpo HTML (`html`) da mensagem, pelas mesmas razões aplicáveis ao corpo em texto e ao código de verificação.
6. THE Renderizador_Email SHALL escapar caracteres especiais de HTML nos valores substituídos nos placeholders, de forma que valores substituídos não introduzam marcação HTML nem vetores de injeção. Nota: o Codigo_Verificacao é uma sequência de 6 dígitos numéricos e, portanto, intrinsecamente seguro; o escaping é adotado como regra geral de robustez para qualquer valor substituído.

### Requisito 7: Validação com provedores SMTP reais

**User Story:** Como desenvolvedor/operador, quero validar a entrega real apontando a Configuracao_SMTP para um provedor SMTP real (ex.: Gmail), para confirmar o fluxo ponta a ponta sem alterar código.

#### Critérios de Aceitação

1. WHERE a Configuracao_SMTP aponta para um provedor SMTP real (por exemplo Gmail), THE Provedor_SMTP SHALL entregar as mensagens usando exatamente as mesmas variáveis de ambiente SMTP, sem exigir código específico por provedor.
2. WHERE o provedor exige uma Senha_De_App (por exemplo Gmail com verificação em duas etapas), THE Configuracao_SMTP SHALL aceitar essa Senha_De_App na variável `SMTP_PASS`.
3. THE validação de entrega real SHALL ser possível apenas ajustando as variáveis de ambiente `SMTP_*` e definindo `EMAIL_PROVIDER=smtp`, sem alteração de código.

### Requisito 8: Documentação das variáveis de ambiente

**User Story:** Como operador do sistema, quero as variáveis SMTP documentadas no `.env.example`, para que eu saiba exatamente o que configurar para habilitar a entrega de e-mail.

#### Critérios de Aceitação

1. THE arquivo `.env.example` da raiz SHALL documentar a variável `EMAIL_PROVIDER` e as variáveis da Configuracao_SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`).
2. THE documentação no `.env.example` SHALL indicar valores de exemplo seguros (placeholders) sem expor credenciais reais.
3. THE documentação no `.env.example` SHALL incluir orientação para configurar um provedor real (por exemplo Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_PASS` com uma Senha_De_App), como exemplo de referência com placeholders (sem credenciais reais).

### Requisito 9: Não regressão dos testes existentes

**User Story:** Como mantenedor do backend, quero que os testes existentes da feature forgot-password continuem passando, para que a introdução do SMTP não quebre comportamento já validado.

#### Critérios de Aceitação

1. WHEN a suíte de testes do backend é executada após a introdução do Provedor_SMTP, THE suíte de testes SHALL passar com o mesmo conjunto de testes existentes da feature forgot-password.
2. THE introdução do Provedor_SMTP SHALL NOT exigir modificação do comportamento observável de NoopEmailProvider, LoggingEmailProvider ou RetryingEmailService validado pelos testes existentes.
