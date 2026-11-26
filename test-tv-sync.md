# Teste de Sincronização TV-Celular

## Sumário das Alterações

### 1. Aplicativo Nativo Fire TV (MainActivity.kt)
- **Localização**: `firetv/app/src/main/java/br/com/nexobrasil/nexoplayer/firetv/MainActivity.kt`
- **Alteração**: Adicionado fluxo de restauração de sessão no `LaunchedEffect(Unit)` (linhas ~113-134)
- **Funcionalidade**:
  1. Ao iniciar, tenta `tv-pair-get-session` com `tvSessionId`
  2. Se encontrar sessão válida, usa nome/email do usuário e vai para HOME
  3. Fallback para fluxo de pareamento existente

### 2. Mobile Web (PairPage.tsx)
- **Localização**: `src/pages/PairPage.tsx`
- **Alteração**: Após pareamento bem-sucedido (`handleConfirm`), chama `tv-pair-sync-session`
- **Dados enviados**: `deviceId`, `userId`, `userSlug`, `userEmail`, `userName`
- **Estado corrigido**: Layout JSX estava incompleto - corrigido

### 3. TV Web (PlayerTvWelcome.tsx)
- **Localização**: `src/pages/player/PlayerTvWelcome.tsx`
- **Alteração**: Função `handleClaimedRow` atualizada (linhas ~77-114)
- **Fluxo**:
  1. Ao detectar pareamento, tenta `tv-pair-get-session`
  2. Se houver tokens sincronizados, restaura sessão automaticamente
  3. Navega para perfis sem necessidade de confirmação adicional

### 4. Backend (Supabase)
#### Migração: `20261119120000_tv_device_sessions.sql`
- Tabela `tv_device_sessions` criada com:
  - `device_id`, `user_id`, `user_slug` (referências)
  - `access_token`, `refresh_token`, `expires_at` (tokens)
  - `user_email`, `user_name` (dados de referência)
  - Políticas RLS restritivas (apenas via funções)

#### Edge Function: `tv-pair-sync-session`
- Cria sessão de dispositivo TV
- Armazena tokens na tabela `tv_device_sessions`
- Upsert por `device_id,user_id`

#### Edge Function: `tv-pair-get-session`
- Recupera sessão por `deviceId` ou `pairedUserId`
- Valida expiração
- Remove sessões expiradas automaticamente

## Fluxo Completo

### Cenário 1: Pareamento Novo
1. **TV**: Gera QR code via `tv-pair-create`
2. **Celular**: Usuário faz login Google, digita código, confirma
3. **Celular**: Chama `tv-pair-claim`, depois `tv-pair-sync-session`
4. **TV**: Detecta pareamento via polling `tv-pair-status`
5. **TV**: Tenta `tv-pair-get-session` → sucesso
6. **TV**: Restaura sessão automaticamente → navega para perfis

### Cenário 2: Sessão Existente
1. **TV**: Ao iniciar, tenta `tv-pair-get-session` com `tvSessionId`
2. **TV**: Se houver sessão válida → HOME direto
3. **Usuário**: Não precisa parear novamente

### Cenário 3: Fallback Original
1. **TV**: Se não houver sessão sincronizada → mostra QR
2. **Fluxo**: Procede como antes (proof/redeem)

## Status de Build
- **Fire TV APK**: Build em andamento (`assembleDebug`)
- **Web**: Build TypeScript em andamento (`npm run build`)
- **Supabase**: Migração e funções prontas (precisam ser aplicadas)

## Próximos Passos
1. Aguardar conclusão do build APK
2. Verificar logs de build web
3. Aplicar migração Supabase (localmente primeiro)
4. Testar fluxo completo localmente
5. Validar APK no emulador/device físico

## Arquivos Modificados/Criados
- `firetv/app/src/main/java/br/com/nexobrasil/nexoplayer/firetv/MainActivity.kt` (modificado)
- `src/pages/PairPage.tsx` (modificado/corrigido)
- `src/pages/player/PlayerTvWelcome.tsx` (modificado)
- `supabase/functions/tv-pair-sync-session/index.ts` (novo)
- `supabase/functions/tv-pair-get-session/index.ts` (novo)
- `supabase/migrations/20261119120000_tv_device_sessions.sql` (novo)
- `src/lib/tvPairingSync.ts` (novo)

## Observações
- Sistema é **aditivo**: não quebra fluxo existente
- **Preserva dados**: Não remove ou sobrescreve dados existentes
- **Seguro**: Tokens de sessão protegidos, validação de expiração
- **Compatível**: Funciona com ambas emissoras (positiva/interativa)