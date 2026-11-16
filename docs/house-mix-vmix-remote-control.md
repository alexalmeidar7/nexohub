# vMix Control remoto pelo HMD da rádio

O HMD atualizado mantém o conector do estúdio ativo enquanto estiver aberto e
autenticado, mesmo na home. Consulta os estúdios acessíveis à conta e anuncia
somente os que respondem com a API real do vMix na rede local. A conexão nativa
evita CORS/Mixed Content e não aceita endereços públicos, redirecionamentos ou
caminhos fora de `/api/`.

Ao selecionar um estúdio, o painel testa o acesso à API. Se não conseguir acesso
direto, passa a usar o HMD da rádio pelo canal privado daquele estúdio. O estado
“Operando remoto” identifica o transporte; se o HMD sair, o painel deixa de
apresentar seu último estado como online. Um bloqueio de rede, firewall ou
permissão do navegador também pode exigir o relay: o teste verifica acesso,
não promete identificar fisicamente a rede.

## Operação

1. Atualizar e abrir o HMD no computador da rádio que alcança o vMix. Entrar na
   conta responsável pelo estúdio, com o Web Controller habilitado no vMix.
2. No outro computador, entrar na conta autorizada, abrir vMix Control e clicar
   no mesmo estúdio cadastrado. O modo remoto aparece automaticamente quando o
   vMix não é alcançável diretamente.
3. Os botões de Automation e cortes enviam suas ações ao HMD. O painel só
   confirma depois da execução. No HMD do estúdio, o botão correspondente é
   destacado quando a tela está aberta e a última ação remota é identificada.

Ambos os computadores precisam de internet. Não é necessário abrir a porta 8088
na internet nem instalar o Bridge separado para esse transporte. O HMD da rádio
precisa continuar aberto; encerrá-lo ou sair da conta interrompe o relay.

A automação agendada permanece no computador do estúdio. Um painel em modo
remoto não dispara novamente os agendamentos. Comandos recebem ID, prazo de
validade e execução serial por estúdio. Entregas duplicadas não executam o mesmo
comando novamente. Perda de confirmação gera aviso de resultado incerto, sem
repetir cortes/toggles automaticamente.

O relay leva comandos e estado do vMix, sem transportar vídeo NDI/MJPEG pela
internet. A visualização remota de vídeo depende do streaming acessível já
configurado nos monitores.

## Autorização e preservação de dados

O tópico privado `vmix-desktop:<connectionId>` usa Broadcast/Presence com
autorização por RLS. Apenas a conta proprietária da conexão e seus subusuários
ativos podem participar. Canais públicos de outras funcionalidades continuam
inalterados; públicos e privados com o mesmo nome são canais distintos.
Credenciais do Web Controller não são enviadas nas mensagens remotas.

Migration: `20261116231029_vmix_desktop_private_remote_control.sql`.
Antes/depois: 77 tabelas públicas e 5 conexões vMix. Índices, constraints,
triggers e RLS existentes preservados. Foram adicionadas somente duas policies
no transporte Realtime. Nenhum registro de usuário foi alterado ou removido.
O teste de autorização em sessão SQL validou proprietário autorizado, outro
estúdio negado e outro usuário negado, sem inserir dados de teste.

Testes locais simulam computadores distintos, seleção de estúdio, confirmação,
falha real, deduplicação, expiração, falta de confirmação e perda do host. O
transporte nativo é testado com respostas simuladas; nenhum teste aciona um vMix
de produção. A validação de campo deve ser feita com os dois computadores
atualizados e o estúdio real.

Referências:

- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/docs/guides/realtime/concepts
