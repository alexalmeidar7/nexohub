# House Mix — inventário técnico inicial

Data: 2026-10-24
Base analisada: `main` em `434816ce00ed15e68bf449e40fd0dae1cdb7dd2d`
Escopo: leitura do repositório. Nenhum ambiente de produção foi acessado ou alterado.

## 1. Estrutura observada

- Frontend: React 18 + Vite + TypeScript.
- Cliente de dados atual: `@supabase/supabase-js`, inicializado em `src/integrations/supabase/client.ts`.
- Backend: Supabase-compatible Edge Functions em `supabase/functions`; a configuração identifica o projeto atual pelo `project_id` em `supabase/config.toml`.
- Tipos gerados: `src/integrations/supabase/types.ts` declara 81 tabelas em `public.Tables`.
- Migrações: há histórico SQL em `drizzle/migrations` e `supabase/migrations`.
- `drizzle/schema.ts` está intencionalmente vazio; não deve ser tratado como schema completo/fonte de verdade.
- Não há diretório `desktop/`, `electron/` ou `server/` na árvore atual de `main`; a PR antiga de Desktop não é uma base atualizada.
- Existem duas grandes fontes JSON no repositório: `src/data/supabase_local_db.json` (~12,314,674 bytes) e `src/data/supabase_database_dump.json` (~24,564,880 bytes). A existência e o tamanho estão confirmados; conteúdo, data, completude, integridade referencial e aptidão como backup restaurável ainda NÃO foram validados. Não as tratar como backup oficial até validar.

## 2. Domínio e tabelas relevantes identificadas

A tipagem inclui, entre outras:
- Operação: `programas`, `agenda_eventos`, `agenda_participantes`, `roteiros`, `apresentadores`, `programa_automacoes`.
- Cliente e acesso: `profiles`, `user_roles`, `user_settings`, `sub_users`, `empresa_config`, `client_modules`.
- Player e audiência: `player_chat_messages`, `player_heartbeats`, `player_listener_profiles`, `musicas_tocadas`, `audiencia_historico`.
- vMix: `vmix_bridge_pairings`, `vmix_bridge_devices`, `vmix_bridge_jobs`, `vmix_connections`, `vmix_button_interactions`, `preset_commands`.
- Site e mídia: `site_config`, `site_banners`, `site_noticias`, `logos_patrocinadores`, `streaming_channels`.

A lista gerada não substitui introspecção do banco real. É necessário comparar com o banco restaurado/ativo, constraints, índices, triggers, funções, RLS e buckets.

## 3. Riscos e bloqueios antes de empacotar Desktop

### Risco crítico — autenticação com credenciais embutidas no frontend

A leitura de `src/lib/clientAuthAccounts.ts` encontrou registros de credenciais/senhas no código do cliente. Mesmo com repositório privado, qualquer segredo incluído no bundle desktop/web deve ser considerado recuperável por quem recebe o aplicativo. Não distribuir o Desktop com essa lógica. Planejar substituição por autenticação de servidor, migração segura de contas e rotação das credenciais afetadas. Não copiar nem reutilizar essas credenciais em serviços novos.

### Risco alto — inferência de tenant em snapshot legado

`src/lib/supabaseDatabaseSnapshot.ts` contém fallback que atribui `user_id` a programas sem proprietário explícito usando a posição do registro em um array. Isso é inadequado para migração e isolamento de clientes. A nova arquitetura deve exigir mapeamento auditável por IDs/relacionamentos reais; registros ambíguos vão para quarentena até revisão.

### Risco alto — cache localStorage não é banco operacional

`src/lib/stationDatabaseService.ts` guarda um snapshot em memória/localStorage e consulta uma Edge Function para dados remotos. Isso pode servir como cache de interface, mas não é uma base transacional multiusuário, não fornece integridade referencial e não pode ser promovido a banco local oficial.

### Risco alto — exportação e Storage não inventariados

Os arquivos JSON no repositório e os assets estáticos em `public/storage` não comprovam que o Storage ativo da Lovable foi exportado integralmente. Precisamos inventariar buckets, objetos, metadados, políticas, referências de URL e arquivos não versionados.

## 4. Direção técnica recomendada

1. Não alterar o cliente Supabase atual nem a conexão de produção durante a fase de inventário.
2. Obter um export real do banco e inventário/baixada do Storage quando o Cloud estiver acessível.
3. Validar os dois JSONs existentes offline: estrutura, datas, tabelas, contagens, chaves, referências e hashes; comparar com o export real quando disponível.
4. Criar schema local versionado e reproduzível a partir de migrações verificadas; não derivar schema somente de tipos TypeScript.
5. Construir um serviço Windows separado com PostgreSQL local e API LAN autenticada. O renderer Electron nunca recebe credenciais privilegiadas.
6. Implementar tenant/device enrollment e autorização no servidor antes de habilitar sincronização.
7. Adicionar outbox/inbox idempotente, versionamento e política de conflitos por domínio.
8. Só depois implementar standby PostgreSQL, fencing/promoção, backup independente e drills de restauração.
9. Pilotar em cópia isolada de uma única estação; sem cutover de produção até todos os critérios de aceitação passarem.

## 5. Fora de escopo nesta fase

- Nenhuma migração do banco Lovable Cloud.
- Nenhuma troca de URL/variáveis do frontend de produção.
- Nenhuma alteração em RLS, usuários, Edge Functions ou Storage de produção.
- Nenhum merge da PR antiga de Desktop.
- Nenhuma distribuição de instalador para clientes.

## 6. Próxima evidência necessária

- Export SQL real do banco, com data/hora e checksum.
- Inventário e cópia dos objetos de todos os buckets de Storage.
- Relatório de schema real: tabelas, views, funções, triggers, constraints, índices e políticas RLS.
- Verificação de contas/roles/tenant ownership.
- Confirmação de hardware e Windows disponíveis para servidor principal e reserva.
