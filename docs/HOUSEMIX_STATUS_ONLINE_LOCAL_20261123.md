# House Mix — estado de leitura/gravação e redução de chamadas (23/11/2026)

## Problema comprovado
O chip superior mostrava **"Gravando dados..."** até para o POST `/storage/v1/object/list/xml-files`: este POST é uma **leitura** de lista de objetos, não uma gravação. O chip marcava qualquer POST em Storage como escrita. O HMD também regravava XMLs idênticos e algumas páginas consultavam o Supabase com polling agressivo.

## Nova semântica visual
- **Online · Lendo / Online · Gravando**: tráfego real de REST ou Storage no domínio Supabase. É online mesmo quando acessado de um HMD.
- **Local (HMD) · Lendo / Local (HMD) · Gravando**: operações nativas de disco do Windows ou API local do HMD que possam ser observadas. A indicação LOCAL não afirma que o banco compartilhado LAN esteja pronto.
- **Sem operações**: nenhuma solicitação monitorada ativa. Não indica sincronização completa nem conexão com nuvem.
- Tooltip na inatividade: última leitura/gravação bem-sucedida por origem, com horário. Operações curtas (<250ms) não piscam visualmente; ficam no histórico de última atividade.
- Erros não são contados como última operação bem-sucedida. Uma requisição pendente perde o indicador após 20 segundos (a operação de rede **não** é cancelada pelo monitor).
- Auth, Realtime e RPCs de comportamento desconhecido não são classificados como gravações.

## Economia de operações
- O HMD compara os bytes de XML em disco e só grava conteúdo novo; vários refreshes simultâneos do mesmo arquivo usam uma única fila.
- O ciclo de cinco segundos de rotação do Banner L só lê e altera os XMLs quando existem **dois ou mais banners elegíveis**. Com zero ou um, a atualização por alteração de banners ainda é feita.
- `mergeUserDashboardItems` não envia `PATCH` nem altera `updated_at` para patches com valor idêntico (após leitura necessária para garantia de consistência).
- A tela de Promoções para de buscar várias tabelas a cada 10 segundos. Mantém Realtime, atualização por foco e uma conferência de segurança a cada dez minutos quando visível.

## Segurança e limites reais
**NÃO** é verdade que todo o House Mix passou a operar 100% por eventos. A consulta de segurança de XML do HMD a cada minuto continua porque nomes de programas, horários e feeds podem mudar por tempo, mesmo sem uma gravação de banco; remover isso indiscriminadamente causaria atraso no "No Ar". Outras telas ainda podem fazer polling e exigem migração específica por módulo.
**NÃO** existe ainda banco LAN compartilhado oficialmente habilitado entre os computadores; LOCAL = trabalho no HMD daquele computador (ou API local, se configurada).
Esta alteração não pausa, cancela, altera quotas, desativa realtime ou muda segredos do Supabase.

## Testes
`bunx vitest run src/lib/activityStatus.test.ts src/lib/userSettings.test.ts src/lib/desktopPromotionBanners.test.ts`
`node --test desktop/local-xml-write.test.cjs`
Build e suíte de testes completa devem ficar verdes antes do merge.
