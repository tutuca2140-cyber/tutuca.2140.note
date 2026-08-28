# Olivia no n8n

Esta primeira versão permite localizar clientes e consultar contratos, parcelas e pagamentos. Ela é somente leitura.

## Proteção dos dados

O Note Note autentica o usuário, verifica a permissão `canUseOlivia` e resolve o banco ativo antes de chamar o n8n. O n8n não recebe uma conexão direta com o PostgreSQL. O contexto enviado exclui endereço, anotações internas, senha e CPF.

## Configuração no n8n

1. No n8n, abra **Workflows**, escolha **Import from file** e importe `n8n/olivia-notenote.json`.
2. No nó **Modelo OpenAI**, crie ou selecione uma credencial da API da OpenAI.
3. No nó **Receber pergunta do Note Note**, crie uma credencial **Header Auth**:
   - Name: `x-olivia-secret`
   - Value: uma senha longa e aleatória, diferente das demais senhas do sistema.
4. Salve e publique/ative o workflow.
5. Copie a URL de produção do Webhook, terminada em `/webhook/olivia-notenote`.

## Variáveis do Note Note na Vercel

Adicione nas configurações do projeto:

- `N8N_OLIVIA_WEBHOOK_URL`: URL de produção copiada do Webhook.
- `N8N_OLIVIA_SECRET`: exatamente o mesmo valor usado na credencial Header Auth.

Depois, faça um novo deploy do Note Note.

## Liberação pelo Super Admin

No Note Note, abra **Administração > Usuários**, crie ou edite o usuário e ative **Usar a Olivia**. A assistente aparecerá como um botão flutuante que pode ser arrastado pela tela.

## Teste recomendado

1. Entre com um usuário autorizado.
2. Selecione o banco desejado no menu.
3. Abra a Olivia e pergunte: `Localize o cliente João`.
4. Confirme na execução do n8n que o fluxo terminou sem erro.
5. Troque para um banco ao qual o usuário não tem acesso e confirme que ele não aparece como opção.
