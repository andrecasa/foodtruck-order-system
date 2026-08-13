# Implementation Plan: Food Truck Order System

## Overview

Plano de implementação do sistema de pedidos MVP para food truck, organizado em 20 tasks com dependências explícitas. A execução segue a ordem: scaffolding → design system → protótipo → infraestrutura → backend → frontend integrado → bot WhatsApp → testes → documentação.

## Tasks

- [x] 1. Scaffolding do Monorepo @requirements(14) @dependencies(none)
  - [x] 1.1 Criar `package.json` raiz com configuração de pnpm workspaces (`packages/*`, `apps/*`)
  - [x] 1.2 Criar `pnpm-workspace.yaml` com as entradas de packages e apps
  - [x] 1.3 Criar `tsconfig.base.json` com configurações TypeScript compartilhadas (strict, paths)
  - [x] 1.4 Criar estrutura `packages/shared/` com `package.json` e `tsconfig.json`
  - [x] 1.5 Criar estrutura `apps/mobile/` (Expo + React Native) com `package.json`, `app.json` e `tsconfig.json`
  - [x] 1.6 Criar estrutura `apps/web/` (Vite + React) com `package.json`, `vite.config.ts` e `tsconfig.json`
  - [x] 1.7 Criar estrutura `apps/backend/` (Express + Node.js) com `package.json` e `tsconfig.json`
  - [x] 1.8 Criar `.env.example` na raiz com variáveis de ambiente documentadas e valores padrão
  - [x] 1.9 Criar `.gitignore` com entradas para node_modules, dist, .env, volumes Docker
  - [x] 1.10 Validar que `pnpm install` executa sem erros em todo o workspace

- [x] 2. Pacote Shared - Tipos e Validadores @requirements(4,5,7,8,9,12) @dependencies(1)
  - [x] 2.1 Criar `packages/shared/src/types/order.ts` com interfaces Order, OrderItem, CreateOrderRequest, UpdateOrderStatusRequest, RegisterPaymentRequest
  - [x] 2.2 Criar `packages/shared/src/types/menu.ts` com interfaces MenuItem, CreateMenuItemRequest, UpdateMenuItemRequest
  - [x] 2.3 Criar `packages/shared/src/types/summary.ts` com interface DailySummary
  - [x] 2.4 Criar `packages/shared/src/types/theme.ts` com interface ThemeConfig
  - [x] 2.5 Criar `packages/shared/src/types/index.ts` com barrel exports
  - [x] 2.6 Criar `packages/shared/src/validators/order.validator.ts` com schemas Zod
  - [x] 2.7 Criar `packages/shared/src/validators/menu.validator.ts` com schemas Zod (nome 1-100 chars, preço 1-999999)
  - [x] 2.8 Criar `packages/shared/src/validators/payment.validator.ts` com schema Zod
  - [x] 2.9 Criar `packages/shared/src/constants/status.ts` com enums e sequência de transições
  - [x] 2.10 Criar `packages/shared/src/constants/config.ts` com constantes (MAX_QUANTITY, RATE_LIMIT)
  - [x] 2.11 Criar `packages/shared/src/index.ts` com barrel exports
  - [x] 2.12 Validar que o pacote compila sem erros com `tsc --noEmit`

- [x] 3. Design System - Tokens e ThemeProvider @requirements(1) @dependencies(1,2)
  - [x] 3.1 Criar `apps/mobile/src/theme/theme.config.ts` com tokens padrão conforme ThemeConfig
  - [x] 3.2 Criar `apps/mobile/src/theme/ThemeProvider.tsx` com React Context e hook `useTheme()`
  - [x] 3.3 Criar `apps/web/src/theme/theme.config.ts` espelhando tokens do mobile
  - [x] 3.4 Criar `apps/web/src/theme/ThemeProvider.tsx` com CSS variables
  - [x] 3.5 Implementar carregamento de tema via variável de ambiente ou arquivo externo
  - [x] 3.6 Garantir que ThemeProvider aplica tema globalmente antes de renderizar componentes filhos
  - [x] 3.7 Criar `docs/design-system.md` com tokens, valores padrão e instruções de novo tema
  - [x] 3.8 Validar contraste WCAG AA nos tokens padrão

- [x] 4. Design System - Componentes Base @requirements(1) @dependencies(3)
  - [x] 4.1 Criar componente Button (primary, secondary, outline, danger) para mobile e web
  - [x] 4.2 Criar componente Input com label, erro e máscara de moeda para mobile e web
  - [x] 4.3 Criar componente Card para pedidos na fila
  - [x] 4.4 Criar componente Badge para status (aguardando, preparando, pronto, pago, pendente)
  - [x] 4.5 Criar componente Modal para confirmação de ações
  - [x] 4.6 Criar componente Typography (Text, Heading) com tokens
  - [x] 4.7 Criar componentes Layout (Screen, Header, ScrollContainer, Grid)
  - [x] 4.8 Garantir acessibilidade WCAG 2.1 AA em todos os componentes
  - [x] 4.9 Validar que nenhum componente possui valores visuais hardcoded

- [x] 5. Protótipo - Mock Data e API Client @requirements(2) @dependencies(2)
  - [x] 5.1 Criar `apps/mobile/src/mocks/menu-data.ts` com 5+ itens em 2 categorias
  - [x] 5.2 Criar `apps/mobile/src/mocks/orders-data.ts` com 3+ pedidos em diferentes estados
  - [x] 5.3 Criar `apps/mobile/src/mocks/mock-client.ts` com respostas simuladas
  - [x] 5.4 Criar `apps/web/src/mocks/` espelhando dados mockados do mobile
  - [x] 5.5 Criar `apps/web/src/mocks/mock-client.ts` com simulação de atualizações
  - [x] 5.6 Criar `apps/mobile/src/services/api-client.ts` com switch PROTOTYPE_MODE
  - [x] 5.7 Criar `apps/web/src/services/api-client.ts` com mesmo padrão
  - [x] 5.8 Garantir interface idêntica entre mock e real client

- [x] 6. Protótipo - Telas do App Mobile @requirements(2,7) @dependencies(4,5)
  - [x] 6.1 Criar tela de Login com campos email/senha usando Design System
  - [x] 6.2 Criar tela de Cardápio com listagem por categoria e ordenação
  - [x] 6.3 Criar tela de Criação de Pedido com seleção de itens e cálculo de total
  - [x] 6.4 Criar tela de Fila de Pedidos com cards e badges de status
  - [x] 6.5 Criar tela de Pagamento com valor total e seleção de forma
  - [x] 6.6 Criar tela de Resumo do Dia com totais e breakdown por forma de pagamento
  - [x] 6.7 Implementar banner "Modo Protótipo" em todas as telas
  - [x] 6.8 Implementar navegação entre telas (Expo Router)
  - [x] 6.9 Garantir que ações atualizam estado local via mock client
  - [x] 6.10 Validar uso exclusivo de componentes do Design System
  - [x] 6.11 Adicionar filtro de status (FilterChips) no topo da tela de Fila de Pedidos com opções: aguardando, preparando, pronto, entregue
  - [x] 6.12 Implementar lógica de filtro: por padrão exibir aguardando/preparando/pronto; ocultar entregue até selecionado
   - [x] 6.13 Criar tela de Criar Item do Cardápio (formulário com nome, preço, categoria) seguindo design Penpot
  - [x] 6.14 Criar tela de Editar Item do Cardápio (formulário preenchido com dados do item existente) seguindo design Penpot
  - [x] 6.15 Adicionar FAB "+ Novo Item" na tela de Cardápio para navegar à tela de criação
  - [x] 6.16 Adicionar ação "Editar" nos itens da listagem do Cardápio para navegar à tela de edição

- [x] 7. Protótipo - Tela do Preparador (Web) @requirements(2) @dependencies(4,5)
  - [x] 7.1 Criar tela de Login web usando Design System
  - [x] 7.2 Criar tela de Fila do Preparador com cards ordenados cronologicamente
  - [x] 7.3 Implementar distinção visual entre pedidos aguardando e preparando
  - [x] 7.4 Exibir em cada card: número, nome, origem, itens, status
  - [x] 7.5 Implementar botão de avanço de status nos cards
  - [x] 7.6 Implementar simulação Realtime: auto-advance após 10 segundos
  - [x] 7.7 Remover pedido da fila quando status avança para entregue
  - [x] 7.8 Implementar banner "Modo Protótipo"
  - [x] 7.9 Validar uso exclusivo de componentes do Design System
  - [x] 7.10 Criar componente FilterChips para web com specs Penpot (height 32px, borderRadius 16px, 12% opacity active bg)
  - [x] 7.11 Adicionar filtro de status (FilterChips) no topo da tela de Fila com opções: aguardando, preparando, pronto, entregue
  - [x] 7.12 Implementar lógica de filtro: por padrão exibir aguardando/preparando/pronto; ocultar entregue até selecionado

- [x] 8. Docker Compose e Supabase Self-Hosted @requirements(14) @dependencies(1)
  - [x] 8.1 Criar docker-compose.yml com PostgreSQL (volume, healthcheck)
  - [x] 8.2 Adicionar serviço Supabase Auth (GoTrue) com JWT
  - [x] 8.3 Adicionar serviço Supabase Realtime
  - [x] 8.4 Adicionar serviço Kong (API Gateway)
  - [x] 8.5 Adicionar serviço Evolution API com volume
  - [x] 8.6 Adicionar serviço Backend com Dockerfile
  - [x] 8.7 Configurar rede Docker interna
  - [x] 8.8 Criar .env.example completo com valores padrão funcionais
  - [x] 8.9 Garantir que nenhum segredo está hardcoded
  - [x] 8.10 Validar `docker compose config` sem erros

- [x] 9. Banco de Dados - Migrations e Seed @requirements(13,14) @dependencies(8)
  - [x] 9.1 Criar migration para tabela `users`
  - [x] 9.2 Criar migration para tabela `categories`
  - [x] 9.3 Criar migration para tabela `menu_items`
  - [x] 9.4 Criar migration para tabela `orders`
  - [x] 9.5 Criar migration para tabela `order_items`
  - [x] 9.6 Criar migration para tabela `daily_sequences`
  - [x] 9.7 Criar migration para tabela `whatsapp_sessions`
  - [x] 9.8 Criar índices (orders_active, orders_date, daily_number UNIQUE, menu_items_name UNIQUE CI)
  - [x] 9.9 Criar função `next_daily_number` com lock implícito
  - [x] 9.10 Criar seed com categorias e itens de cardápio
  - [x] 9.11 Criar script de execução de migrations na inicialização

- [x] 10. Backend - Autenticação @requirements(3) @dependencies(8,9)
  - [x] 10.1 Implementar POST /api/auth/login com Supabase Auth (sessão 8h)
  - [x] 10.2 Implementar POST /api/auth/logout
  - [x] 10.3 Criar middleware authMiddleware (JWT verify, 401 se inválido)
  - [x] 10.4 Implementar rate limiting (5 tentativas, bloqueio 15min)
  - [x] 10.5 Retornar mensagem genérica sem revelar campo incorreto
  - [x] 10.6 Reset do contador após login bem-sucedido
  - [x] 10.7 Criar rota de verificação de sessão
  - [x] 10.8 Adicionar testes unitários para rate limiting e JWT

- [x] 11. Backend - CRUD Cardápio @requirements(4) @dependencies(10)
  - [x] 11.1 Implementar GET /api/menu (ativos, agrupados por categoria, ordenados)
  - [x] 11.2 Implementar POST /api/menu com validação Zod
  - [x] 11.3 Implementar PUT /api/menu/:id com validação de colisão de nome
  - [x] 11.4 Implementar PATCH /api/menu/:id/status (ativar/desativar)
  - [x] 11.5 Validar unicidade case-insensitive (HTTP 409)
  - [x] 11.6 Validar preço ≤ 0 (HTTP 422)
  - [x] 11.7 Validar categoria inexistente (HTTP 422)
  - [x] 11.8 Garantir update sem alterar ID
  - [x] 11.9 Adicionar testes unitários

- [x] 12. Backend - Criação de Pedidos @requirements(5,12) @dependencies(11)
  - [x] 12.1 Implementar POST /api/orders com validação Zod
  - [x] 12.2 Integrar next_daily_number para número sequencial
  - [x] 12.3 Implementar snapshot de preço (unit_price_cents, item_name)
  - [x] 12.4 Implementar cálculo de total em centavos
  - [x] 12.5 Persistir em transação (orders + order_items) com rollback
  - [x] 12.6 Publicar evento new_order no Realtime orders:queue
  - [x] 12.7 Validar apenas itens ativos
  - [x] 12.8 Rejeitar origem inválida (HTTP 422)
  - [x] 12.9 Tratar conflito de número sequencial (HTTP 409)
  - [x] 12.10 Adicionar testes unitários

- [x] 13. Backend - Status de Pedidos @requirements(7) @dependencies(12)
  - [x] 13.1 Implementar PATCH /api/orders/:id/status
  - [x] 13.2 Validar sequência de transição (HTTP 422 se inválida)
  - [x] 13.3 Registrar started_at (aguardando→preparando)
  - [x] 13.4 Registrar ready_at (preparando→pronto)
  - [x] 13.5 Registrar delivered_at (pronto→entregue)
  - [x] 13.6 Publicar evento no Realtime orders:queue
  - [x] 13.7 Retornar 404 se pedido não encontrado
  - [x] 13.8 Adicionar testes unitários para transições válidas e inválidas

- [x] 14. Backend - Pagamento @requirements(8) @dependencies(12)
  - [x] 14.1 Implementar POST /api/orders/:id/payment com validação Zod
  - [x] 14.2 Atualizar payment_status, payment_method e paid_at
  - [x] 14.3 Rejeitar pagamento duplicado (HTTP 409)
  - [x] 14.4 Rejeitar forma de pagamento inválida (HTTP 422)
  - [x] 14.5 Publicar evento no Realtime orders:payment
  - [x] 14.6 Retornar 404 se pedido não encontrado
  - [x] 14.7 Adicionar testes unitários

- [x] 15. Backend - Resumo do Dia @requirements(9) @dependencies(14)
  - [x] 15.1 Implementar GET /api/summary/today baseado em order_date (America/Sao_Paulo)
  - [x] 15.2 Retornar totalOrders, paidOrders, pendingOrders
  - [x] 15.3 Retornar paidTotal e pendingTotal em centavos
  - [x] 15.4 Retornar byPaymentMethod (dinheiro, pix, cartão)
  - [x] 15.5 Utilizar date-fns-tz para conversão de timezone
  - [x] 15.6 Garantir invariante: totalOrders = paidOrders + pendingOrders
  - [x] 15.7 Adicionar testes unitários para agregações e fronteira de meia-noite

- [x] 16. Frontend - Integração Real (App Mobile) @requirements(3,4,5,6,7,8,9) @dependencies(6,10,11,12,13,14,15)
  - [x] 16.1 Criar real-client.ts com chamadas HTTP reais ao backend
  - [x] 16.2 Implementar fluxo de autenticação (login, token, logout, expiração)
  - [x] 16.3 Implementar hook useAuth() com estado de sessão
  - [x] 16.4 Implementar hook useRealtime() com Supabase Realtime (orders:queue, orders:payment)
  - [x] 16.5 Implementar reconexão automática com reload de dados
  - [x] 16.6 Integrar Resumo do Dia com atualização via Realtime
  - [x] 16.7 Implementar tratamento de erros de rede (retry, toast)
  - [x] 16.8 Garantir que PROTOTYPE_MODE=false conecta ao backend real
  - [x] 16.9 Testar fluxo completo end-to-end
  - [x] 16.10 Implementar filtro de status no topo da tela de fila (chips: aguardando, preparando, pronto, entregue)
  - [x] 16.11 Ocultar pedidos `entregue` por padrão; exibir somente quando filtro `entregue` está selecionado
  - [x] 16.12 Ao selecionar filtro `entregue`, listar pedidos do dia ordenados por `delivered_at` decrescente

- [x] 17. Frontend - Integração Real (Tela Preparador) @requirements(6,7,13) @dependencies(7,12,13)
  - [x] 17.1 Criar real-client.ts para web com chamadas HTTP reais
  - [x] 17.2 Implementar autenticação web (login, sessionStorage, logout)
  - [x] 17.3 Implementar hook useRealtime() para web (orders:queue)
  - [x] 17.4 Implementar indicador visual de "conexão perdida" (banner vermelho)
  - [x] 17.5 Implementar reconexão a cada 5s com reload de pedidos ativos
  - [x] 17.6 Marcar dados como desatualizados durante desconexão
  - [x] 17.7 Carregar estado completo na inicialização antes de ativar Realtime
  - [x] 17.8 Remover pedido da fila ao receber evento de status entregue
  - [x] 17.9 Testar fluxo: login → fila → novo pedido via Realtime → avançar status
  - [x] 17.10 Implementar filtro de status no topo da tela de fila (chips: aguardando, preparando, pronto, entregue)
  - [x] 17.11 Ocultar pedidos `entregue` por padrão; exibir somente quando filtro `entregue` está selecionado
  - [x] 17.12 Ao selecionar filtro `entregue`, listar pedidos do dia ordenados por `delivered_at` decrescente

- [x] 18. Backend - Bot WhatsApp (Evolution API) @requirements(10,11) @dependencies(12)
  - [x] 18.1 Implementar POST /api/webhook/evolution (validação API Key)
  - [x] 18.2 Criar máquina de estados (saudacao, selecionando, resumo)
  - [x] 18.3 Implementar estado saudacao: saudação + cardápio formatado (R$ X,XX)
  - [x] 18.4 Implementar estado selecionando: acumular itens no carrinho JSONB
  - [x] 18.5 Implementar estado resumo: exibir lista, preços e total
  - [x] 18.6 Implementar confirmação: criar pedido (origin=whatsapp) e enviar número + total
  - [x] 18.7 Implementar gerenciamento de sessão (criar, retomar, encerrar)
  - [x] 18.8 Implementar timeout 10min: encerrar sessão e enviar mensagem
  - [x] 18.9 Implementar tratamento de mensagens inesperadas
  - [x] 18.10 Implementar caso de cardápio vazio (informar e encerrar)
  - [x] 18.11 Adicionar testes unitários para máquina de estados e carrinho

- [x] 19. Testes de Propriedade @requirements(1,2,3,4,5,6,7,8,9,10,11,12,13,14) @dependencies(11,12,13,14,15,18)
  - [x] 19.1 Configurar fast-check + Vitest no backend e frontends
  - [x] 19.2 Property 1: Contraste WCAG AA (ratio ≥ 4.5:1 e ≥ 3:1)
  - [x] 19.3 Property 2: Criação de item válido retorna status ativo
  - [x] 19.4 Property 3: Unicidade case-insensitive rejeita com 409
  - [x] 19.5 Property 4: Update preserva ID e altera apenas campos informados
  - [x] 19.6 Property 5: Cardápio ordenado por categoria e nome
  - [x] 19.7 Property 6: Apenas itens ativos na seleção e bot
  - [x] 19.8 Property 7: Pedido criado com status aguardando e pagamento pendente
  - [x] 19.9 Property 8: Total = Σ(preço × quantidade)
  - [x] 19.10 Property 9: Fila ordenada por created_at crescente
  - [x] 19.11 Property 10: Card contém número, nome, origem, itens, status
  - [x] 19.12 Property 11: Transições válidas registram timestamps
  - [x] 19.13 Property 12: Transições inválidas rejeitadas com 422
  - [x] 19.14 Property 13: Pagamento válido atualiza para pago
  - [x] 19.15 Property 14: Pagamento duplicado rejeitado com 409
  - [x] 19.16 Property 15: Fronteira de data por fuso horário
  - [x] 19.17 Property 16: Invariante de agregação do resumo
  - [x] 19.18 Property 17: Acumulação correta do carrinho do bot
  - [x] 19.19 Property 18: Formatação do cardápio (R$ X,XX, agrupado)
  - [x] 19.20 Property 19: Numeração sequencial sem lacunas/duplicatas

- [x] 20. Finalização e Documentação @requirements(14) @dependencies(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19)
  - [x] 20.1 Validar docker compose up inicializa todos os serviços em < 5 minutos
  - [x] 20.2 Validar migrations automáticas na inicialização
  - [x] 20.3 Validar seed inicial popula cardápio
  - [x] 20.4 Verificar .env.example com TODAS as variáveis e valores padrão
  - [x] 20.5 Criar README.md com pré-requisitos, instalação e execução
  - [x] 20.6 Documentar configuração de tema (white label) no README
  - [x] 20.7 Documentar conexão WhatsApp via Evolution API (QR code) no README
  - [x] 20.8 Validar funcionamento sem internet (exceto WhatsApp)
  - [x] 20.9 Executar checklist final: telas acessíveis, fluxos completos, Realtime funcionando

## Task Dependency Graph

```json
{
  "waves": [
    {"tasks": [1], "description": "Scaffolding do monorepo"},
    {"tasks": [2, 8], "description": "Shared types + Docker infra"},
    {"tasks": [3, 5, 9], "description": "Tokens + Mocks + Migrations"},
    {"tasks": [4, 10], "description": "Componentes + Auth"},
    {"tasks": [6, 7, 11], "description": "Protótipos + Cardápio API"},
    {"tasks": [12], "description": "Criação de pedidos"},
    {"tasks": [13, 14, 18], "description": "Status + Pagamento + Bot"},
    {"tasks": [15], "description": "Resumo do dia"},
    {"tasks": [16, 17, 19], "description": "Integração real + Testes PBT"},
    {"tasks": [20], "description": "Finalização e documentação"}
  ]
}
```

## Notes

- Tasks 6 e 7 (protótipos) podem ser executadas em paralelo após Tasks 4 e 5
- Tasks 8 e 9 (infra) podem ser executadas em paralelo com Tasks 3-7 (design system e protótipo)
- Tasks 13 e 14 podem ser executadas em paralelo (ambas dependem apenas de Task 12)
- Tasks 16 e 17 podem ser executadas em paralelo (integração mobile e web)
- Task 19 (testes PBT) pode iniciar parcialmente assim que Tasks 11-15 estiverem prontas
