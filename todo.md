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

## Atualização 25 - Autenticação com Usuário e Senha

### Schema e Banco de Dados
- [x] Adicionar campos de senha ao schema de usuários
- [x] Criar migração para adicionar campos de autenticação local
- [x] Implementar hash de senha com bcrypt

### Routers de Autenticação
- [x] Criar procedimento de login com usuário/senha
- [x] Criar procedimento de registro de novo usuário
- [x] Implementar validação de credenciais
- [x] Gerar tokens JWT para sessão local

### Interface de Login
- [x] Criar página de login com abas (Manus OAuth / Usuário e Senha)
- [x] Implementar formulário de login com validação
- [x] Implementar formulário de registro (opcional)
- [x] Adicionar opção de "Lembrar-me"
- [x] Adicionar recuperação de senha

### Testes e Validação
- [x] Testar login com usuário/senha
- [x] Testar logout
- [x] Testar manutenção de sessão
- [x] Testar compatibilidade com Manus OAuth


## Atualização 26 - Super Administrador Global Draco
- [x] Criar/confirmar Draco diretamente no banco com senha protegida
- [x] Garantir papel super_admin, ativo e seis permissões totais
- [x] Integrar sessões locais ao contexto global de autenticação
- [x] Impedir alteração de permissões, papel e status do Draco
- [x] Impedir exclusão do Draco
- [x] Criar testes de login, permissões e imutabilidade
- [x] Gerar ZIP atualizado e validar entrega
- [x] Atualizar checkpoint e link público de teste

### Observação de segurança
A senha do Draco foi fornecida pelo proprietário do projeto para configuração inicial. Ela não será exibida em interfaces públicas nem gravada em arquivos do projeto.


## Pendências de entrega identificadas
- [x] Validar a estrutura e o conteúdo essencial do ZIP gerado
- [ ] Criar novo checkpoint após as mudanças do super administrador Draco
- [ ] Enviar a entrega final com o checkpoint atualizado e o link público vigente


## Validações adicionais de recuperação
- [x] Disponibilizar fluxo administrativo visível para redefinição segura
- [x] Testar caminho feliz, expiração e uso único do token de recuperação
