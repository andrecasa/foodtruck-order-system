# Clean Code e Boas Práticas

Estas orientações valem para todo prompt neste repositório. Antes de escrever ou
alterar código, aplique estes princípios. Eles refletem o estilo já praticado no
`order-system` (backend Express + mobile Expo/React Native), então priorize
consistência com o que já existe em vez de introduzir estilos novos.

## Princípios gerais

- **Legibilidade acima de esperteza.** Prefira código direto e explícito a
  soluções compactas difíceis de ler. Quem lê depois é a prioridade.
- **Funções pequenas e com uma responsabilidade.** Se uma função faz validação,
  acesso a dados e formatação ao mesmo tempo, quebre-a. Veja como o backend
  separa `controller` (HTTP), `service` (regra de negócio) e `tenant-repository`
  (acesso a dados) — mantenha essa separação.
- **Nomes revelam intenção.** Nomeie funções e variáveis pelo que representam no
  domínio (`validateEmail`, `listCategories`, `tenantContext`), não por detalhes
  de implementação. Evite abreviações obscuras.
- **Evite estado e efeitos colaterais desnecessários.** Prefira funções puras
  para lógica de transformação (ex.: `formatCurrency`, `extractDigits` em
  `apps/mobile/src/components/Input.tsx`). Isole efeitos (I/O, rede, banco) das
  regras puras.
- **Falhe cedo e de forma explícita.** Valide entradas no início e lance erros
  claros (ex.: `MissingTenantContextError` lançado antes de qualquer I/O em
  `tenant-repository.ts`). Não deixe estados inválidos se propagarem.

## DRY — eliminar duplicação

- **Antes de escrever código novo, procure algo equivalente já existente.**
  Reutilize helpers, serviços e componentes já presentes em vez de recriá-los.
  Exemplos de reuso já estabelecidos no projeto:
  - Backend: `asyncHandler`, `parseBody`, `sendError`, `logError` em `src/http/`,
    a classe única `ServiceError` (reexportada pelos services) e o
    `tenantRepository` para todo acesso a dados.
  - Mobile: componentes reutilizáveis em `src/components/` (ex.: `Input`,
    `Button`, `Screen`), o `useTheme()` para tokens de estilo e serviços de
    validação dedicados em `src/services/` (ex.: `email-validation`).
- **Extraia quando o mesmo conceito aparecer três vezes.** Duas ocorrências
  podem ser coincidência; três indicam que vale um helper, uma função utilitária
  ou um componente. Não abstraia cedo demais (evite complexidade especulativa),
  mas não deixe duplicação real se acumular.
- **Não duplique regras de negócio.** Se a mesma validação ou cálculo existe no
  service, não a reescreva no controller ou na tela. Schemas de validação
  compartilhados devem vir de `@order-system/shared` quando aplicável.

## Ao alterar código existente

- **Leia o arquivo (e vizinhos relevantes) antes de editar.** Nunca proponha
  mudanças em código que você não viu. Combine com o estilo do arquivo.
- **Mudança mínima e focada.** Resolva o problema pedido sem "limpar" código ao
  redor que não faz parte da tarefa. Se notar melhorias fora de escopo, aponte-as
  separadamente (veja `code-review-checklist.md`) em vez de aplicá-las em silêncio.
- **Preserve o contrato.** Mantenha assinaturas públicas, formatos de resposta e
  mensagens (pt-BR) estáveis, a menos que a tarefa peça o contrário.

## Comentários e documentação

- Siga o padrão do projeto: **JSDoc em pt-BR no topo** de funções, telas,
  componentes e módulos com lógica não trivial, explicando o "porquê" e citando
  requisitos de spec quando existirem (ex.: `R2.2`, `R6.3`).
- Comente decisões que não são óbvias pelo código (ex.: por que `forgotPassword`
  sempre responde 200 neutro). Não comente o óbvio.

## O que evitar

- Introduzir bibliotecas novas quando já existe uma equivalente no projeto.
- Números e strings mágicos: use constantes nomeadas (ex.: `MAX_EMAIL_LENGTH`,
  `NEUTRAL_MESSAGE`).
- Tratamento de erro genérico que engole exceções silenciosamente (exceto quando
  for intencional e documentado, como o fluxo neutro de forgot-password).
- Vazar detalhes internos em respostas ao cliente (o `errorHandler` central já
  garante 500 genérico para erros inesperados — não contorne isso).
