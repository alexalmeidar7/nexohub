# HMD/HMO — validação de entrega consolidada (23/11/2026)

As mudanças desta PR devem ser testadas separadamente **antes do merge**.

## XML local
- Verificar cada feed em cada emissora, especialmente `tempo.xml` da Interativa.
- Feed 404/503: preservar último XML válido; se nunca houve arquivo, criar placeholder com `disponivel=0` e retentar sem bloquear outros feeds.
- O placeholder **não representa tempo atualizado**. Corrigir a origem `xml-files/xml-tempo-<user_id>.xml` no backend.

## Broadcast
- Ligar `A Seguir` no HMD, salvar e reabrir HMD/HMO, inclusive em dois computadores.
- A rotina a cada 5 minutos de ticker não pode restaurar um valor anterior.
- Simular falhas de gravação e confirmar que a interface sinaliza erro.

## Audiência
- Deploy manual e auditado da migration `20261123182000_restore_audience_collector_official.sql` e das três Edge Functions `collect-audience`, `count-stream-listeners`, `count-video-viewers`.
- Confirmar job `collect-audience-every-15-minutes` aponta **apenas** a `qazvgmgdidjhbvcuinpy`.
- Exigir URLs de estatísticas reais de cada provedor; URL de reprodução não fornece contagem.
- Verificar credenciais e teste de leitura para cada rádio; não confundir `0` com fonte indisponível.
- Exibir média/pico por programa em HMD/HMO depois de duas leituras agendadas.
- O contador ao vivo no frontend não substitui o serviço de coleta de fundo.

## Segurança LAN (bloqueador)
- Múltiplas estações precisam de principal/secundários com HTTPS mTLS/certificados confiáveis, isolamento por tenant, enrollment, sincronização idempotente e prevenção de split-brain.
- **Não habilitar** rede LAN, failover automático ou compartilhamento do PostgreSQL sem os testes exigidos por `infra/offline-first/LAN-SECURITY-GATE.md`.
- A PR não implementa nem ativa LAN entre computadores; exige fase de integração e validação na rede da rádio.

## WhatsApp (bloqueador)
- O fluxo recomendado é Meta Embedded Signup com aprovação do App, configuração e autorização do proprietário da conta.
- O código atual utiliza token global e configuração manual; **não** promover a integração multi-emissora até existir token seguro por emissora e webhook com HMAC obrigatório.
- Não prometer vínculo apenas por SMS ou operação sem autorização Meta.

## Assinatura Windows (bloqueador)
- A estrutura de signing já existe; precisa do certificado oficial em GitHub Secrets.
- SmartScreen pode continuar mostrando aviso até a reputação amadurecer.

### Publicação
Não fazer merge/release só porque TypeScript ou CI passaram; verificar credenciais, casos de produção, rollback e as dependências acima.
