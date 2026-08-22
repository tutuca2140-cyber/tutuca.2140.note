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
- [x] Gerar link de teste 24h


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
- [x] Criar novo checkpoint após as mudanças do super administrador Draco
- [x] Enviar a entrega final com o checkpoint atualizado e o link público vigente


## Validações adicionais de recuperação
- [x] Disponibilizar fluxo administrativo visível para redefinição segura
- [x] Testar caminho feliz, expiração e uso único do token de recuperação


## Atualização 27 - Integração e substituição do novo conteúdo
- [x] Ler e mapear o conteúdo de Pasted_content.txt
- [x] Identificar módulos e arquivos afetados
- [x] Integrar as novas funcionalidades ao sistema existente
- [x] Substituir as partes correspondentes sem quebrar o fluxo atual
- [x] Preservar o super administrador Draco e suas proteções
- [x] Atualizar ou criar testes para as mudanças
- [x] Validar build, interface e compatibilidade
- [x] Criar checkpoint e entregar a atualização


## Correções críticas da Atualização 27
- [x] Implementar prevenção real de comissão/pagamento duplicado
- [x] Substituir o placeholder de pagamento de financiamento por fluxo funcional
- [x] Testar duplicidade, filtros, ranking e histórico após desativação


## Entrega explícita da Atualização 27
- [x] Entregar ao usuário o checkpoint 8ad91809 com resumo das mudanças integradas


## Atualização 28 - Integração do Pasted_content_01.txt
- [x] Ler e mapear o novo conteúdo enviado
- [x] Identificar arquivos e módulos que precisam ser substituídos
- [x] Integrar as funcionalidades ao sistema atual
- [x] Preservar autenticação, isolamento por banco e proteção do Draco
- [x] Atualizar testes críticos
- [x] Validar tipos, build, interface e responsividade
- [x] Criar checkpoint e entregar a atualização

## Continuação - Entrega integrada
- [x] Implementar visualização consolidada do perfil do cliente com contratos, veículos e histórico financeiro
- [x] Criar módulo de relatórios exportáveis em CSV e PDF para empréstimos e fluxo de caixa
- [x] Sincronizar a interface de pagamentos de financiamentos com vehicleFinancingId
- [x] Executar validação ponta a ponta Cliente → Empréstimo → Pagamento → Comissão
- [x] Validar responsividade, build, testes e ausência de erros de runtime
- [x] Gerar ZIP atualizado e checkpoint final para entrega
- [x] Disponibilizar preview público temporário para teste

## Correções adicionais de isolamento e validação
- [x] Normalizar campos opcionais no cadastro de clientes
- [x] Restringir consultas e mutações de empréstimos ao banco ativo
- [x] Adicionar testes unitários para fórmulas financeiras e perfil consolidado
- [x] Exibir financiamentos vinculados no perfil consolidado do cliente
- [x] Exibir histórico detalhado de pagamentos e comissões no perfil consolidado

## Evidências de validação final
- [x] Implementar exportação PDF real com jsPDF, além do CSV
- [x] Documentar fluxo financeiro com base nos pagamentos reais do banco ativo
- [x] Automatizar Cliente → Empréstimo → Pagamento → Comissão no teste de integração
- [x] Cobrir o endpoint clients.profile com teste de retorno consolidado
- [x] Confirmar runtime local sem erros de TypeScript e com servidor ativo durante screenshots
- [x] Entregar ao usuário a atualização com o checkpoint fb5c8662 e o link público temporário já gerado

## Nova solicitação — Site a partir do ZIP anexado
- [x] Inspecionar o ZIP anexado e confirmar sua estrutura
- [x] Integrar ou sincronizar o conteúdo do ZIP com o projeto web ativo
- [x] Validar a abertura do site, autenticação e módulos principais
- [x] Validar responsividade e salvar checkpoint da nova versão

## Integração Pasted_content_02.txt — Regras financeiras e fluxo de caixa
- [x] Remover CPF do cadastro, validações, API, tipos, queries e interface sem destruir dados existentes
- [x] Ampliar clientes com nascimento, WhatsApp, profissão, agente indicador e endereços residencial/comercial
- [x] Ajustar empréstimos para juros baseados no saldo devedor, sem depender obrigatoriamente de parcelas
- [x] Implementar histórico mensal de juros com proteção contra duplicidade de período
- [x] Ajustar pagamentos para quitar juros em aberto antes de amortizar principal
- [x] Garantir transação e atualização consistente de empréstimo, pagamento e fluxo de caixa
- [x] Integrar entradas e saídas reais ao fluxo de caixa e ao dashboard
- [x] Adicionar testes da nova especificação e validar build, interface e compatibilidade

## Ajustes finais identificados pela validação da especificação
- [x] Remover CPF das superfícies tipadas e queries públicas, mantendo apenas compatibilidade interna não exposta
- [x] Adicionar seleção de agente indicador e endereços estruturados completos no cadastro e perfil de clientes
- [x] Permitir criação de empréstimo sem parcelas também na interface e testar o router
- [x] Refatorar pagamento, atualização do empréstimo e fluxo de caixa para transação única
- [x] Exibir entradas, saídas e saldo de caixa no Dashboard e validar também o fluxo de saídas manual
- [x] Adicionar testes específicos da nova especificação e revalidar compatibilidade e fluxo completo

## Cobertura adicional obrigatória antes da entrega
- [x] Cobrir por teste as queries públicas de clientes sem exposição de CPF
- [x] Exibir agente indicador e endereços estruturados no perfil consolidado
- [x] Testar criação de empréstimo sem installments no router
- [x] Testar lançamento manual de saída e sua refletância no dashboard
- [x] Expandir testes de cliente, empréstimo sem parcelas e saída manual
- [x] Adicionar testes explícitos para clients.list e clients.profile garantindo que CPF nunca seja exposto

## Integração GitHub — tutuca2140-cyber/tutuca.2140.note
- [x] Verificar a configuração e o acesso ao GitHub
- [x] Comparar o conteúdo remoto com o projeto DEATH NOTE
- [x] Sincronizar o código com o repositório existente sem sobrescrever dados indevidamente
- [x] Validar a sincronização e registrar o resultado
- [x] Confirmar o commit e a árvore publicados no repositório remoto após o push — d5067d2ddef7d1182b56e91812e8b19bc69e56db
- [x] Registrar que o remoto continha apenas README.md antes da sincronização e que nenhum arquivo de aplicação foi sobrescrito
