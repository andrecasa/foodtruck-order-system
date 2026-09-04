# Requirements Document

## Introduction

Esta feature adiciona um fluxo self-service de "Esqueceu sua senha?" ao aplicativo mobile do sistema de pedidos. Hoje a redefinição de senha existe apenas no lado administrativo (um admin dispara `PATCH /api/users/{id}/password`), o que exige a intervenção de outra pessoa. Este fluxo permite que o próprio usuário, sem estar autenticado, solicite a recuperação da senha.

O fluxo tem três etapas para o usuário: (1) a partir da tela de login, o usuário acessa o ponto de entrada "Esqueceu sua senha?" e informa seu e-mail; (2) o sistema envia um código de verificação numérico para esse e-mail; (3) em uma tela do aplicativo, o usuário informa o código recebido e define uma nova senha.

O desenho respeita as restrições já existentes no sistema: autenticação apoiada no Supabase, arquitetura multi-tenant (usuários pertencem a um tenant), mensagens em pt-BR, tratamento de erros via `ServiceError` com `statusCode`/`code`, e senhas com política de 8 a 72 caracteres (limite do Supabase). Por segurança, o fluxo não revela se um e-mail está ou não cadastrado.

## Glossary

- **Sistema_Recuperacao**: O componente de backend responsável por gerar, entregar e validar códigos de verificação e por aplicar a nova senha. Exposto por endpoints públicos (sem autenticação) da API.
- **App_Mobile**: O aplicativo mobile (Expo/React Native) que apresenta o ponto de entrada, a tela de solicitação de código e a tela de redefinição de senha.
- **Codigo_Verificacao**: Código numérico de 6 dígitos gerado pelo Sistema_Recuperacao, associado a um único usuário e com prazo de validade definido.
- **Usuario**: Registro na tabela `users`, identificado por e-mail e pertencente a um `tenant_id`.
- **Tenant**: Organização à qual um Usuario pertence, conforme a tabela `tenants`.
- **Servico_Email**: O provedor externo responsável pela entrega da mensagem de e-mail contendo o Codigo_Verificacao.
- **Janela_Solicitacao**: Intervalo de tempo usado para limitar a quantidade de solicitações de código por e-mail e por endereço IP.
- **Prazo_Validade**: Duração, a partir da geração, durante a qual um Codigo_Verificacao pode ser usado. Definido em 15 minutos.
- **Mensagem_Neutra**: Resposta padronizada que confirma o envio de instruções sem revelar se o e-mail informado está cadastrado.
- **Portao_Autenticacao (auth gate)**: Mecanismo do App_Mobile que redireciona automaticamente para `/login` qualquer rota não autorizada quando não há sessão ativa. Somente rotas explicitamente incluídas na lista de rotas públicas são acessíveis sem autenticação.

## Requirements

### Requisito 1: Ponto de entrada "Esqueceu sua senha?" na tela de login

**User Story:** Como usuário que esqueceu a senha, quero um acesso a "Esqueceu sua senha?" na tela de login, para que eu possa iniciar a recuperação sem depender de um administrador.

#### Critérios de Aceitação

1. WHILE a tela de login estiver sendo exibida, THE App_Mobile SHALL exibir um controle acionável rotulado "Esqueceu sua senha?" visível sem necessidade de rolagem.
2. WHEN o usuário aciona o controle "Esqueceu sua senha?", THE App_Mobile SHALL navegar para a tela de solicitação de código de verificação em até 2 segundos.
3. THE App_Mobile SHALL registrar a tela de solicitação de código de verificação como rota pública, autorizada no Portao_Autenticacao, de modo que seja acessível sem sessão autenticada ativa e NÃO seja redirecionada para `/login`.
4. IF a navegação para a tela de solicitação de código de verificação falhar, THEN THE App_Mobile SHALL permanecer na tela de login e exibir uma mensagem de erro indicando que a navegação não foi concluída.
5. THE App_Mobile SHALL registrar a tela de redefinição de senha como rota pública, autorizada no Portao_Autenticacao, acessível sem sessão autenticada ativa.

### Requisito 2: Solicitação de código de verificação

**User Story:** Como usuário que esqueceu a senha, quero informar meu e-mail e solicitar um código de verificação, para que eu receba um código que autorize a troca da senha.

#### Critérios de Aceitação

1. THE App_Mobile SHALL fornecer um campo de e-mail e um controle de envio na tela de solicitação de código.
2. WHEN o usuário envia a solicitação com um e-mail em formato válido, THE Sistema_Recuperacao SHALL responder com a Mensagem_Neutra confirmando que, se o e-mail estiver cadastrado, instruções foram enviadas, em até 5 segundos.
3. IF o e-mail informado está em formato inválido ou está vazio ou excede 254 caracteres, THEN THE Sistema_Recuperacao SHALL retornar erro de validação com mensagem em pt-BR indicando que o formato do e-mail é inválido, sem gerar nem enviar Codigo_Verificacao.
4. WHEN o e-mail informado corresponde a um Usuario com `status` igual a "ativo", THE Sistema_Recuperacao SHALL gerar um Codigo_Verificacao numérico de 6 dígitos com validade de 15 minutos a partir da geração e solicitar o envio ao Servico_Email para o endereço do Usuario.
5. WHEN o e-mail informado não corresponde a nenhum Usuario cadastrado, THE Sistema_Recuperacao SHALL responder com a mesma Mensagem_Neutra sem gerar nem enviar Codigo_Verificacao.
6. WHEN o e-mail informado corresponde a um Usuario com `status` igual a "inativo", THE Sistema_Recuperacao SHALL responder com a mesma Mensagem_Neutra sem gerar nem enviar Codigo_Verificacao.
7. IF o Servico_Email falhar ao aceitar a solicitação de envio do Codigo_Verificacao, THEN THE Sistema_Recuperacao SHALL invalidar o Codigo_Verificacao gerado e responder com a mesma Mensagem_Neutra, registrando a falha para diagnóstico interno.
8. IF forem recebidas mais de 5 solicitações de código para o mesmo e-mail dentro de uma janela de 15 minutos, THEN THE Sistema_Recuperacao SHALL rejeitar as solicitações adicionais respondendo com a mesma Mensagem_Neutra sem gerar nem enviar novo Codigo_Verificacao.

### Requisito 3: Geração do código de verificação

**User Story:** Como responsável pela segurança, quero que os códigos de verificação sejam gerados de forma imprevisível e com escopo definido, para que não possam ser adivinhados ou reutilizados indevidamente.

#### Critérios de Aceitação

1. THE Sistema_Recuperacao SHALL gerar cada Codigo_Verificacao como uma sequência de exatamente 6 dígitos numéricos (0-9), incluindo zeros à esquerda quando aplicável, usando uma fonte de aleatoriedade criptograficamente segura.
2. THE Sistema_Recuperacao SHALL associar cada Codigo_Verificacao a exatamente um Usuario e ao respectivo `tenant_id`.
3. THE Sistema_Recuperacao SHALL definir o Prazo_Validade de cada Codigo_Verificacao em 15 minutos a partir do instante de geração.
4. THE Sistema_Recuperacao SHALL armazenar o Codigo_Verificacao de forma protegida (hash) em vez de texto puro.
5. WHEN um novo Codigo_Verificacao é gerado para um Usuario, THE Sistema_Recuperacao SHALL invalidar os códigos anteriores ainda válidos do mesmo Usuario.
6. IF a quantidade de tentativas incorretas de validação de um Codigo_Verificacao atinge 5, THEN THE Sistema_Recuperacao SHALL invalidar esse Codigo_Verificacao.
7. WHEN um Codigo_Verificacao é utilizado com sucesso para redefinir a senha, THE Sistema_Recuperacao SHALL marcá-lo como utilizado e recusar qualquer reuso.

### Requisito 4: Limitação de taxa de solicitações

**User Story:** Como responsável pela segurança, quero limitar a frequência de solicitações de código, para que o fluxo não seja usado para abuso, spam de e-mail ou enumeração de contas.

#### Critérios de Aceitação

1. IF a quantidade de solicitações de código para um mesmo e-mail atinge 5 dentro de uma Janela_Solicitacao de 15 minutos, THEN THE Sistema_Recuperacao SHALL recusar toda solicitação adicional desse e-mail durante o restante da Janela_Solicitacao e retornar uma resposta de erro indicando limite de taxa excedido, com mensagem em pt-BR.
2. IF a quantidade de solicitações de código originadas de um mesmo endereço IP atinge 5 dentro de uma Janela_Solicitacao de 15 minutos, THEN THE Sistema_Recuperacao SHALL recusar toda solicitação adicional desse IP durante o restante da Janela_Solicitacao e retornar uma resposta de erro indicando limite de taxa excedido, com mensagem em pt-BR.
3. WHEN a Janela_Solicitacao de 15 minutos de um e-mail ou IP se encerra, THE Sistema_Recuperacao SHALL reiniciar a contagem de solicitações desse e-mail ou IP para 0 e voltar a aceitar novas solicitações.
4. WHILE uma solicitação está sendo recusada por limite de taxa, THE Sistema_Recuperacao SHALL retornar a Mensagem_Neutra idêntica à retornada para solicitações aceitas, sem incluir qualquer informação que indique se o e-mail está cadastrado.
5. IF uma solicitação é recusada por limite de taxa, THEN THE Sistema_Recuperacao SHALL preservar os códigos e as solicitações válidas já registrados sem alterá-los ou invalidá-los.

### Requisito 5: Validação do código e definição da nova senha

**User Story:** Como usuário que solicitou a recuperação, quero informar o código recebido e definir uma nova senha, para que eu recupere o acesso à minha conta.

#### Critérios de Aceitação

1. THE App_Mobile SHALL fornecer uma tela com os campos obrigatórios de Codigo_Verificacao, nova senha e confirmação da nova senha.
2. WHEN o usuário submete um Codigo_Verificacao válido, não expirado e não utilizado, junto de uma nova senha válida com no mínimo 8 e no máximo 72 caracteres, THE Sistema_Recuperacao SHALL atualizar a senha do Usuario correspondente via Supabase.
3. WHEN o Sistema_Recuperacao atualiza a senha do Usuario com sucesso, THE Sistema_Recuperacao SHALL marcar o Codigo_Verificacao como utilizado.
4. WHEN o Sistema_Recuperacao atualiza a senha do Usuario com sucesso, THE Sistema_Recuperacao SHALL invalidar todas as sessões ativas do Usuario.
5. WHEN a atualização da senha é concluída com sucesso, THE App_Mobile SHALL exibir confirmação de sucesso e navegar o usuário para a tela de login.
6. IF a nova senha e a confirmação da nova senha não são idênticas, THEN THE App_Mobile SHALL exibir mensagem de erro e impedir o envio.
7. IF o Codigo_Verificacao informado é inválido, expirado ou já utilizado, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR, sem alterar a senha.
8. IF a atualização da senha via Supabase falhar, THEN THE Sistema_Recuperacao SHALL retornar erro em pt-BR sem marcar o Codigo_Verificacao como utilizado.

### Requisito 6: Regras de validade e uso do código

**User Story:** Como responsável pela segurança, quero regras claras de expiração e limite de tentativas de código, para que códigos vazados ou adivinhados tenham utilidade mínima.

#### Critérios de Aceitação

1. IF o Codigo_Verificacao informado não corresponde ao código armazenado do Usuario, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR, sem alterar a senha.
2. IF o Codigo_Verificacao informado está expirado conforme o Prazo_Validade de 15 minutos, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR, sem alterar a senha.
3. IF o Codigo_Verificacao informado já foi utilizado, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR, sem alterar a senha.
4. IF a quantidade de tentativas incorretas de validação para um mesmo Codigo_Verificacao atinge 5, THEN THE Sistema_Recuperacao SHALL invalidar esse Codigo_Verificacao e recusar novas tentativas com mensagem em pt-BR.
5. WHEN um Codigo_Verificacao válido, não expirado, não utilizado e dentro do limite de tentativas é submetido com uma nova senha válida, THE Sistema_Recuperacao SHALL aceitar a redefinição.

### Requisito 7: Política de senha

**User Story:** Como responsável pela segurança, quero que a nova senha respeite a política vigente do sistema, para que o padrão de senhas se mantenha consistente com o restante da aplicação.

#### Critérios de Aceitação

1. IF a nova senha informada tem menos de 8 caracteres, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR indicando que a senha deve ter entre 8 e 72 caracteres inclusive.
2. IF a nova senha informada tem mais de 72 caracteres, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR indicando que a senha deve ter entre 8 e 72 caracteres inclusive.
3. IF a nova senha informada está vazia ou ausente, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR indicando que a senha deve ter entre 8 e 72 caracteres inclusive.
4. THE App_Mobile SHALL validar o comprimento da nova senha (8 a 72 caracteres inclusive) antes de enviar a solicitação de redefinição e bloquear o envio quando o comprimento for inválido.

### Requisito 8: Escopo multi-tenant

**User Story:** Como operador do sistema multi-tenant, quero que a recuperação de senha respeite os limites de tenant, para que a redefinição afete apenas o usuário correto.

#### Critérios de Aceitação

1. WHEN uma redefinição é submetida, THE Sistema_Recuperacao SHALL resolver o Usuario alvo a partir do e-mail e do Codigo_Verificacao associados, mantendo o `tenant_id` do Usuario.
2. WHEN a senha é redefinida, THE Sistema_Recuperacao SHALL alterar a credencial apenas do Usuario associado ao Codigo_Verificacao.
3. WHERE o mesmo e-mail estiver associado a mais de um Tenant, THE Sistema_Recuperacao SHALL tratar cada Usuario correspondente de forma independente na geração e na validação do Codigo_Verificacao.
4. IF o par e-mail + Codigo_Verificacao não resolve nenhum Usuario, THEN THE Sistema_Recuperacao SHALL recusar a redefinição com mensagem em pt-BR.
5. THE Sistema_Recuperacao SHALL recusar um Codigo_Verificacao aplicado a Usuario de tenant diferente daquele ao qual o código foi associado.

### Requisito 9: Entrega de e-mail e tratamento de falhas

**User Story:** Como usuário aguardando o código, quero que a entrega do e-mail seja tratada de forma robusta, para que uma falha temporária no envio não exponha informações nem trave o fluxo.

#### Critérios de Aceitação

1. WHEN o Sistema_Recuperacao solicita o envio de um Codigo_Verificacao, THE Sistema_Recuperacao SHALL incluir na mensagem o código e a instrução de que o código expira em 15 minutos.
2. IF o Servico_Email falha ao entregar a mensagem, THEN THE Sistema_Recuperacao SHALL reenviar a mensagem em até 3 tentativas, com intervalo mínimo de 2 segundos entre tentativas.
3. IF o Servico_Email falha em todas as 3 tentativas de envio, THEN THE Sistema_Recuperacao SHALL registrar a falha internamente e responder ao cliente com a Mensagem_Neutra, sem expor a causa da falha.
4. THE Sistema_Recuperacao SHALL responder à solicitação de código dentro de 5 segundos, delegando o envio de e-mail de forma assíncrona, de modo que a resposta ao cliente não dependa da confirmação de entrega pelo Servico_Email.
5. THE Sistema_Recuperacao SHALL responder a toda solicitação de código com uma resposta indistinguível — mesmo conteúdo, mesmo formato e tempo de resposta dentro do mesmo limite de 5 segundos — independentemente de o e-mail existir, ter sido entregue ou ter falhado.
