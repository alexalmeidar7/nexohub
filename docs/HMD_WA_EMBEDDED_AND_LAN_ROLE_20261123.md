# HMD/HMO — Conexão Meta e configuração LAN

## WhatsApp oficial — fluxo simples
- A nova aba remove o formulário de Phone Number ID, webhook e tokens. O usuário autoriza seu número pelo Embedded Signup da Meta.
- No HMD, a autorização abre no navegador HTTPS (FB Login não suporta o protocolo interno Electron). No HMO, abre pelo SDK JavaScript da Meta.
- Após o login, `whatsapp-connect` troca o código **no servidor**, valida que o número pertence à conta WABA autorizada, assina os webhooks e solicita o registro do número na Cloud API quando necessário.
- A tabela `wa_private_credentials` guarda o token de cada rádio criptografado em AES-256-GCM; não é lida pelo navegador. `wa_config` permanece com os metadados não secretos.
- Webhook exige assinatura HMAC mesmo se houver falha de configuração. Envio, automações e disparos usam o token **da emissora**, não um token global.

### Pré-requisitos obrigatórios antes de ligar o botão
1. O produto House Mix precisa de App Meta Business com **Facebook Login for Business / Embedded Signup** aprovado e permissões avançadas `whatsapp_business_management` e `whatsapp_business_messaging`.
2. Configurar na Edge Functions Secrets do Supabase oficial:
   - `META_APP_ID` — ID do App Meta
   - `META_APP_SECRET` — segredo do App (nunca no frontend)
   - `META_EMBEDDED_SIGNUP_CONFIG_ID` — ID da configuração de Embedded Signup
   - `WHATSAPP_VERIFY_TOKEN` — token aleatório usado para verificação do webhook
   - `WHATSAPP_TOKEN_ENCRYPTION_KEY` — chave AES de 32 bytes em Base64, armazenada fora do repositório; fazer backup seguro
3. Registrar a URL única `https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/whatsapp-webhook` no **App da Meta**, uma única vez pela plataforma, e assinar os eventos `messages` e `message_status`.
4. Executar manualmente o workflow protegido de produção para aplicar a migration `20261123191500` e publicar `whatsapp-connect`, `whatsapp-webhook`, `whatsapp-send` e `whatsapp-broadcast`.
5. Configurar domínios autorizados do FB SDK e as URLs OAuth do House Mix no Meta Developers.
6. Testar com uma conta real de rádio, verificar recebimento e envio e observar custos/políticas Meta.

**Não autorizar o uso comercial sem a aprovação da Meta e testes de mensagens.** A interface fica desabilitada se os segredos não estiverem configurados. O código não remove a necessidade do webhook da Meta: ele o torna invisível para o usuário final.

## Computadores principal e secundários
- Cada instalação HMD armazena uma preferência **local por emissora** em `app.getPath("userData")/station-roles/`; o renderer não pode gravar na configuração diretamente.
- Um HMD pode ser selecionado como **principal** ou **secundário**; a interface mostra o papel escolhido.
- A conexão entre PCs **não é ativada por essa preferência**: o serviço local permanece loopback-only. O status é `not_paired`; o HMD não falsifica operação LAN.
- Até existir e passar a suíte `infra/offline-first/LAN-SECURITY-GATE.md`, a sincronização atual via Supabase continua ativa em ambos para não gerar perda ou divergência de dados.
- Realtime solicita atualização imediata. O reparo periódico dos feeds e banners foi reduzido de 1 para 15 minutos, preservando consultas necessárias de relógio/tempo e recuperação após eventos perdidos.
- A ativação efetiva de **1 principal + N secundários**, sem acesso do secundário à nuvem, exige autenticação individual, TLS/certificados, tenant isolation, sincronização de dados com idempotência, resolução de conflitos, proteção de split-brain e testes em uma LAN real.
- **Não mostrar "Lendo/gravando do principal" até a operação corresponder a uma transferência autenticada de dados.**

## Validação
- Executar build, testes completos, validação TypeScript/Deno das Edge Functions, smoke tests de configurações Electron e isolamento de conta.
- No HMD: trocar entre os papéis, reiniciar app, validar configuração persistente, verificar que alterar emissora não replica preferência.
- WhatsApp: usuário sem Meta config deve ver botão desabilitado; usuário de outra emissora ou subusuário não deve conectar um número indevido; validar Graph API e HMAC.
- Conferir que nenhuma chave privada ou bearer token é retornada ao navegador nem inserida em logs.
