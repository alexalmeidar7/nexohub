# HMD — atualização automática, fonte local e economia Supabase

Data: 23/11/2026. Implementação incremental; somente Windows Electron.
Não declara HMD 100% offline ou banco LAN compartilhado.

## Atualização sem intervenção
- O HMD consulta a release em segundo plano, baixa automaticamente via electron-updater e instala às **00h30 do horário local do Windows** (uma vez por release). Não instala apenas porque o usuário fechou o aplicativo; manual "instalar agora" continua disponível após concluir o download.
- O processo de instalação deve iniciar o aplicativo automaticamente (`quitAndInstall(true, true)`), conforme NSIS. O sistema precisa estar ligado, com aplicativo em execução e acesso à distribuição para obter nova versão. Se a máquina desligar no horário agendado, o próximo ciclo deve tratar a pendência; não é garantia de atualização sem sistema em execução.
- Se a janela separada **vMix Control** estava aberta durante a instalação, é salvo marcador de restauração local, válido por 72h e para a versão seguinte; o HMD reabre a janela em primeiro plano, usando o estúdio/identificador de conexão persistido pela sessão autenticada em localStorage. Não são persistidas senhas em texto nem tokens extras. A conexão depende de sessão/autorização ainda válida e da disponibilidade do próprio vMix. Se não for possível reconectar, a janela exibe o estado desconectado; não trocar silenciosamente de estúdio.
- A restauração automática foi planejada apenas para instalação via atualizador, não para cada reinicialização ou abertura normal.

## Fonte de música local no Windows
- O navegador usa FileSystemFileHandle, cuja autorização pode expirar depois de atualizar. No HMD Electron, a seleção feita pelo usuário via diálogo nativo é salva como caminho local por rádio no perfil do Windows.
- **Uma única nova seleção** do XML/TXT poderá ser necessária na primeira instalação desta funcionalidade. Nas atualizações seguintes, o HMD restaura o arquivo diretamente, com watcher de alterações (e checagem de segurança local a cada 90 segundos).
- O caminho nunca é sincronizado para a nuvem; permissões do próprio Windows controlam leitura. Se o arquivo mudar de pasta/drive, selecione novamente.

## Redução concreta de chamadas ao Supabase
- HMD Música no Ar: desativa upload repetido do XML **idêntico** a cada 10 segundos e remove tentativa extra de upload na leitura seguinte; atualização do caminho de XML apenas quando for realmente novo.
- Consulta de fallback HMD para `user_settings`/histórico: de 2,5s para **5 min**; Realtime continua como caminho imediato.
- HMD secundário sem arquivo físico: fallback de busca em Storage de 2s para **2 min**; HMO de 2s para 20s (quando essa tela está aberta). O armazenamento em nuvem ainda não é substituído por LAN.
- Polling de sincronização global HMD: quando Realtime conectado, de 15s para **3 min**; quando não conectado, 90s. HMO preserva a lógica anterior.
- Exceções musicais e apresentadores do HMD: verificações de segurança reduzidas a 10min; verificações do HMO permanecem como antes.

## Limites e medição
- O login no HMD e outros módulos ainda usam Supabase. Os fluxos de cenas/XML podem consultar Edge Functions por sistemas externos (vMix). Esses fluxos não são afetados por esta PR e podem permanecer como parte importante do tráfego.
- Mesmo com essas otimizações, **não cancelar o Supabase** antes de completar a autenticação local, o banco LAN e a migração dos feeds e do HMO.
- Monitorar antes/depois (intervalos equivalentes com mesma rádio/equipamentos ligados) por endpoint e por serviço, contando chamadas/minuto e transferência. Logs de Edge não identificam individualmente o HMD sem marcação explícita.
- Se Supabase/Realtimes caírem, o arquivo nativo e os recursos locais continuam acessíveis, mas módulos online e conexões não cacheadas não estão garantidos.

## Validação
`node --test desktop/auto-update-schedule.test.cjs desktop/local-music-source.test.cjs`
`bunx vitest run src/lib/musicSyncPolling.test.ts`
`node --check desktop/main.cjs`
CI de TypeScript, build, testes completos. Testar em Windows isolado: atualizar NSIS em 00h30 com/sem vMix aberto, confirmar perfil/estúdio, primeira seleção do RDS.txt e reconexão sem prompts na versão seguinte. Não publicar automaticamente uma release até comprovar esses cenários.
