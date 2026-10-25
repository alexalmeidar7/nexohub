# House Mix Offline First — gate de segurança para LAN

**Status:** especificação de segurança; nenhuma comunicação LAN está habilitada por este documento.  
**Escopo:** preparar a próxima etapa de comunicação entre o servidor local principal e estações autorizadas da mesma rede da rádio.

## Decisão obrigatória

O protótipo permanece em loopback (127.0.0.1). Não alterar HOUSEMIX_API_HOST, não definir HOUSEMIX_ALLOW_LAN=true, não publicar a porta da API e não expor PostgreSQL à rede. O banco continua acessível somente pelo servidor local.

A LAN só poderá ser habilitada em uma implementação posterior, depois de todos os critérios deste documento serem testados e aprovados. Este documento não autoriza piloto com dados reais nem deploy de produção.

## Topologia pretendida

- **Servidor principal:** executa a API local e o PostgreSQL; é o único nó que aceita conexões de estações.
- **Estações:** House Mix Desktop autenticado por credencial individual do dispositivo; nunca acessam PostgreSQL diretamente.
- **Servidor reserva:** recebe backups verificáveis e testados; não assume escrita automaticamente nesta fase.
- **Internet / nuvem:** não é requisito para operação local. A indisponibilidade da internet não pode interromper a rede local.
- **Rede:** tráfego permitido apenas entre sub-redes/CIDRs explicitamente configurados pelo operador. Não usar 0.0.0.0 como padrão.

Fluxo lógico:

Estação autorizada → HTTPS → API local → PostgreSQL local

Nenhum caminho direto estação → PostgreSQL é permitido.

## Modelo de ameaças

A implementação deve considerar:
1. dispositivo desconhecido conectado à mesma rede Wi-Fi/LAN;
2. dispositivo cadastrado de outro tenant tentando consultar ou gravar dados;
3. credencial roubada, repetida ou revogada;
4. replay de requisições e duplicação de eventos durante reconexões;
5. estação comprometida tentando explorar a API ou enviar payload excessivo;
6. DNS/IP alterado, servidor falso ou interceptação de tráfego;
7. perda de energia, reinício do servidor ou queda parcial da rede;
8. tentativa de acesso à API a partir de outra rede ou da internet pública.

## Controles obrigatórios antes de abrir a LAN

### Transporte e exposição
- HTTPS obrigatório com TLS 1.2 ou superior; TLS 1.3 preferencial.
- Certificado do servidor validado pelas estações; rejeitar certificado inválido, expirado ou hostname inesperado.
- Não aceitar HTTP em interface LAN.
- Bind somente ao endereço privado configurado pelo operador; nunca publicar em interface pública.
- Firewall do sistema operacional deve restringir a porta da API à sub-rede autorizada.
- PostgreSQL permanece em loopback; nenhuma porta de banco deve ser publicada na LAN.
- CORS não é mecanismo de autenticação e não substitui controles de rede.

### Identidade e autorização
- Cada estação usa chave aleatória individual, nunca segredo global compartilhado.
- Credenciais são armazenadas com proteção do sistema operacional e nunca gravadas em logs.
- Autenticação deve consultar status atual do dispositivo e tenant em cada requisição autenticada.
- Revogação deve invalidar o acesso imediatamente, inclusive após reconexão.
- Tenant e papel vêm exclusivamente do registro autenticado no servidor, nunca do payload.
- Consultas e respostas devem permanecer tenant-scoped.
- Endpoints administrativos e emissão de convites continuam locais, sem exposição remota.

### Proteção da API
- Limites de tamanho de corpo, timeout, rate limit e limites de conexões.
- Validar método, rota, tipos, tamanhos e campos permitidos; rejeitar campos inesperados quando aplicável.
- Respostas de erro não podem revelar SQL, stack trace, segredos ou dados de outro tenant.
- Logs sem tokens, chaves, payloads sensíveis ou dados pessoais desnecessários.
- Requisições de escrita devem exigir chave de idempotência e manter unicidade por tenant.
- Cursor de sincronização deve ser validado, limitado e vinculado ao tenant autenticado.
- Operações de sincronização devem ser retomáveis após queda de rede sem duplicar eventos.

### Sincronização e consistência
- Definir formalmente quais dados são graváveis por cada papel/dispositivo.
- Definir política de conflito por entidade antes de permitir escrita concorrente.
- Não assumir que última gravação vence sem regra aprovada e trilha de auditoria.
- Confirmar persistência no servidor antes de informar sucesso definitivo à estação.
- Estação deve manter fila local durável e reprocessar com idempotência.
- Backups e restauração devem ser testados; checksum isolado não comprova que um backup é restaurável.
- Failover do servidor reserva deve permanecer manual até existir mecanismo testado contra split-brain e dupla escrita.

## Critérios de aceite para uma futura implementação LAN

Todos os itens abaixo são bloqueadores:

- [ ] Teste de conexão HTTPS válido e rejeição de certificado inválido.
- [ ] Porta da API acessível somente a partir da sub-rede autorizada.
- [ ] PostgreSQL inacessível a partir de qualquer estação.
- [ ] HTTP, interface pública e acesso externo rejeitados.
- [ ] Dispositivo não cadastrado recebe 401/403.
- [ ] Dispositivo revogado perde acesso sem esperar expiração de sessão.
- [ ] Tentativas cross-tenant não revelam nem alteram dados.
- [ ] Payload excessivo, rota inválida e excesso de requisições são bloqueados.
- [ ] Repetição da mesma escrita não cria duplicidade.
- [ ] Queda e retorno da rede retomam sincronização sem perda ou duplicação.
- [ ] Conflitos são detectados e tratados conforme política documentada.
- [ ] Logs não contêm credenciais nem payloads sensíveis.
- [ ] Backup é restaurado em ambiente descartável e os dados são conferidos.
- [ ] Testes de build, schema smoke, integração e segurança passam em CI.

## Sequência de implementação

1. **Agora:** revisar e aprovar este modelo de ameaça e os critérios.
2. Implementar testes automatizados de configuração segura, autenticação, autorização e limites sem abrir a LAN.
3. Implementar transporte HTTPS e configuração explícita de interface privada, mantendo LAN desabilitada por padrão.
4. Validar em rede isolada de laboratório, com dados sintéticos e sem conexão com produção.
5. Somente após aprovação documentada, planejar piloto controlado com backup verificado e plano de rollback.

## Fora do escopo desta etapa

- Habilitar HOUSEMIX_ALLOW_LAN.
- Alterar o bind padrão para 0.0.0.0.
- Expor PostgreSQL.
- Criar endpoint administrativo remoto.
- Conectar à aplicação Web, Lovable Cloud ou Supabase de produção.
- Usar dados reais de clientes.
- Ativar failover automático ou escrita simultânea no servidor reserva.

**Regra de segurança:** se qualquer critério não puder ser comprovado, a API continua em 127.0.0.1 e a LAN permanece desabilitada.
