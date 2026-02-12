# DEATH NOTE - Sistema de Gestão - TODO

## Banco de Dados e Schema
- [x] Criar tabela de usuários com campos de permissões
- [x] Criar tabela de bancos de dados (databases)
- [x] Criar tabela de clientes
- [x] Criar tabela de empréstimos (loans)
- [x] Criar tabela de pagamentos (payments)
- [x] Criar tabela de veículos
- [x] Criar tabela de financiamentos de veículos
- [x] Criar tabela de auditoria (audit_logs)
- [x] Gerar e aplicar migrações SQL

## Camada de Dados (server/db.ts)
- [x] Implementar funções de gerenciamento de usuários
- [x] Implementar funções de gerenciamento de permissões
- [x] Implementar funções de gerenciamento de bancos de dados
- [x] Implementar funções CRUD de clientes
- [x] Implementar funções CRUD de empréstimos
- [x] Implementar funções CRUD de pagamentos
- [x] Implementar funções de financiamento de veículos
- [x] Implementar funções de auditoria

## Routers tRPC (server/routers.ts)
- [x] Criar procedimentos de autenticação
- [x] Criar procedimentos administrativos (adminProcedure)
- [x] Criar routers de usuários
- [x] Criar routers de permissões
- [x] Criar routers de bancos de dados
- [x] Criar routers de clientes
- [x] Criar routers de empréstimos
- [x] Criar routers de pagamentos
- [x] Criar routers de veículos
- [x] Criar routers de relatórios
- [x] Criar routers de auditoria

## Interface - Autenticação e Layout
- [x] Configurar tema azul (#2563eb) no index.css
- [x] Criar página de login integrada com Manus OAuth
- [x] Criar DashboardLayout com sidebar navegação
- [x] Implementar hook useAuth para controle de autenticação
- [x] Criar componente de proteção de rotas

## Painel Administrativo
- [x] Criar página /admin/usuarios para gerenciamento de usuários
- [x] Criar página /admin/bancos para gestão de bancos de dados
- [x] Criar página /admin/auditoria com logs do sistema
- [x] Criar página /admin/configuracoes para ajustes
- [x] Implementar controle de acesso baseado em roles

## Módulos Principais
- [x] Criar página /dashboard com métricas e estatísticas
- [x] Criar página /clientes com CRUD de clientes
- [x] Criar página /emprestimos com listagem
- [x] Criar página /pagamentos com histórico
- [x] Criar página /veiculos com estoque
- [x] Criar página /financiamentos
- [x] Criar página /relatorios

## Finalização
- [x] Testar fluxo completo de autenticação
- [x] Testar isolamento de dados entre bancos
- [x] Criar checkpoint final
- [ ] Gerar link de teste 24h


## Atualização 24 - Correção e Integração de Financiamentos

### Módulo de Financiamentos
- [x] Corrigir rotas /financiamentos
- [x] Implementar carregamento correto de financiamentos
- [x] Permitir abertura individual de financiamento
- [x] Implementar edição completa (valor, juros, parcelas, status, datas)
- [x] Garantir atualização correta no banco de dados
- [x] Preservar histórico de pagamentos

### Integração Pagamentos com Financiamentos
- [x] Adicionar seletor de tipo de contrato (Empréstimo/Financiamento)
- [x] Listar financiamentos ativos ao selecionar tipo
- [x] Permitir seleção de parcela específica
- [x] Implementar pagamento parcial ou total
- [x] Atualizar status automaticamente

### Fluxo de Caixa Automático
- [x] Criar tabela de fluxo de caixa (cash_flow)
- [x] Gerar entrada automática ao registrar pagamento
- [x] Classificar como "Entrada – Pagamento Empréstimo" ou "Entrada – Pagamento Financiamento"
- [x] Vincular cliente, contrato e parcela
- [x] Prevenir duplicação de registros
- [x] Sincronizar com dashboard

### Testes e Validação
- [x] Testar acesso à lista de financiamentos
- [x] Testar abertura individual
- [x] Testar edição
- [x] Testar pagamento total
- [x] Testar pagamento parcial
- [x] Testar atualização de fluxo de caixa
- [x] Testar atualização de status
- [x] Testar responsividade (celular, tablet, desktop)
- [x] Verificar console para erros
- [x] Validar códigos HTTP (sem 404 ou 500)