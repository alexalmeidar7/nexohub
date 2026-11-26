# Auditoria local do pareamento do Nexo Player

Revisão em 18/11/2026 das migrations `20261118224733_nexo_tv_device_pairing.sql` e `20261118224739_nexo_player_listener_enrollment.sql`. O resultado local sustenta a compatibilidade parcial. A aplicação em produção depende dos pontos abaixo e de conferência no projeto hospedado.

## Compatibilidade e pontos de decisão

| Área | Resultado |
| --- | --- |
| Cadastro existente | `ouvintes.id` e `tv_pairing_codes.code` são chaves primárias compatíveis nas migrations de origem. As novas FKs usam `RESTRICT`. A aplicação das migrations cria tabelas, funções e índices. As alterações em dados ocorrem apenas quando as novas funções são invocadas. Confirmar colunas, tipos, defaults, constraints e triggers no projeto oficial. |
| Cadastro por rádio | O vínculo usa conta, identidade Google e rádio. A adoção de cadastro antigo usa e-mail normalizado na mesma rádio e recusa correspondência ambígua, vínculo incompatível e cadastro bloqueado. O código preserva valores preenchidos e o total existente. A origem Nexo Player fica no vínculo, enquanto a coluna de origem exibida no cadastro legado continua com seu valor atual ou default. |
| Pontuação | O ledger garante unicidade por ouvinte e campo nas operações do novo fluxo. O painel `OuvintesPage.tsx` ainda salva `pontuacaoAuto` diretamente em `ouvintes.pontuacao` ao editar. Isso pode substituir pontos já acumulados e desalinhar o total do ledger. Corrigir e testar a edição administrativa antes de aplicar. Confirmar as regras publicadas em `user_settings.dashboard_items.pontuacao_rules_cadastro`. Uma alteração disponível só no armazenamento do navegador do administrador fica fora do cálculo do servidor. |
| Códigos QR | A tabela legada reserva o código de quatro dígitos como chave primária. O gerador procura apenas códigos pendentes ou confirmados. Um código expirado ainda pode colidir na inserção, e o espaço disponível cai conforme o histórico cresce. A nova FK reforça a preservação do histórico. Resolver a alocação e o reuso seguro antes de expandir o fluxo. |
| RLS e privilégios | As três tabelas novas habilitam RLS e revogam acesso de `PUBLIC`, `anon` e `authenticated`. As RPCs são executáveis por `service_role`. A RLS versionada de perfis usa a conta autenticada e o par conta/rádio é único. O escopo efetivo de `ouvintes`, `tv_pairing_codes`, `user_settings` e perfis hospedados depende das políticas, grants e triggers efetivamente instalados. |
| Auth | A revogação usa uma função `SECURITY DEFINER` com `search_path` vazio, nomeada no schema exposto `public` e com execução restrita ao serviço. O dono efetivo precisa de `USAGE` em `auth`, leitura e atualização nas colunas usadas de `auth.sessions` e `auth.refresh_tokens`. O teste local executou com `postgres` do cluster descartável. Em produção, confirmar os direitos do dono efetivo e a configuração de sessão única e MFA com a emissão por link de uso único. |
| Efeito da revogação | A TV limpa sua sessão ao receber a revogação e o servidor bloqueia a renovação. Um JWT de acesso já emitido pode permanecer aceito até expirar por endpoints que só conferem a assinatura. Auditar os endpoints sensíveis e validar que consultam o estado da sessão se a revogação precisar produzir efeito imediato. |
| Bloqueios durante aplicação | O índice de e-mail é criado sobre `ouvintes` sem `CONCURRENTLY`. Medir tamanho, atividade e tempo de bloqueio do índice em cópia isolada antes de decidir a estratégia de aplicação. |

A [consulta de pré-verificação](../supabase/tests/nexo_tv_preflight.sql) roda em transação somente leitura e retorna metadados de colunas, chaves, RLS e privilégios. Em produção, deve ser rodada como o papel que efetivamente criaria a função de revogação. As duas migrations ainda estão pendentes de auditoria no ambiente oficial.

No PostgreSQL 17.11 de QA, confirmei todas as colunas exigidas pelas duas migrations, a RLS nas três tabelas novas e os grants de execução das RPCs. O banco descartável não contém `player_listener_profiles` e usa a política mais antiga de `tv_pairing_codes`. A revisão desses pontos foi feita pelo histórico versionado. A migration posterior `20260812184649_dc7967b0-fe2d-41bd-befe-5ef73326c98c.sql` revoga a leitura por `anon` e `authenticated`. Confirmar sua aplicação no projeto oficial faz parte da pré-verificação.

A política versionada de `player_listener_profiles` verifica o dono do perfil. Ela permite que a própria conta crie perfis para diferentes rádios. A elegibilidade da rádio para cadastro e pontuação é aplicada no fluxo de pareamento. Incluir a tentativa de ler e editar o perfil de outra conta no ensaio de RLS em QA.

## Backup

Confirmar em **Database → Backups** a data e o estado do snapshot mais recente, ou a janela de PITR e o ponto proposto. A prova de recuperação é a restauração em outro ambiente autorizado e isolado, com conferência de contagens, totais de pontos, relacionamentos, estrutura e Auth. Objetos do Storage, inclusive avatares enviados para buckets, exigem evidência de recuperação própria. O ensaio local usa apenas dados fictícios e não comprova a existência de backup no projeto oficial. [Backups do Supabase](https://supabase.com/docs/guides/platform/backups)

O backup lógico local foi restaurado em um banco descartável vazio, sem substituir o banco de origem. As duas bases apresentaram as mesmas contagens e soma de pontos, incluindo 2 ouvintes, 8 usuários, 9 sessões, 3 aparelhos, 6 créditos e 40 pontos no total.

## Roteiro para Google e Fire TV físico

**Pré-condições.** Usar uma conta Google de teste e um cliente OAuth de teste. Configurar uma origem HTTPS de QA acessível ao celular e ao Fire TV, o callback dessa instância no Google e a URL de retorno no Auth isolado. O APK de QA precisa apontar tanto a API quanto o destino do QR para esse ambiente. A WebView bloqueia conteúdo misto e a origem padrão do QR aponta para o site oficial. Conferir esses destinos no build antes da instalação. [Configuração do Google no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

| Caso | Procedimento e aceitação |
| --- | --- |
| Instalação de QA | Depois da autorização, instalar um APK de QA com nome distinto. Comparar SHA-256 da compilação com `base.apk` no dispositivo e conferir `versionName` e `versionCode` por ADB. |
| Login e QR | Abrir o app na TV e escanear pelo celular. Confirmar origem de QA, botão do Google, retorno com o mesmo código e avanço da TV após uma confirmação. Testar rejeição após expiração e recusar nova confirmação do mesmo código. |
| Avatar e perfis | Preparar um perfil principal com foto Google, um subperfil com avatar próprio e uma conta sem foto. Conferir nome e avatar principal, trocar de perfil e validar avatar e saudação na Home. Confirmar o avatar padrão para a conta sem foto e ausência de perfis duplicados. |
| Persistência | Forçar parada apenas do APK de QA, reabrir e reiniciar o Fire TV. A conta e o perfil selecionado devem voltar sem QR. O celular pode estar desconectado durante esse teste. |
| Cadastro e pontos | Em duas rádios fictícias, conferir vínculo independente, reaproveitamento do cadastro preexistente, atualização de pontos por campo e ausência de crédito em duplicidade. A TV segue para perfis enquanto o formulário abre só no celular. |
| Desvinculação | Testar logout pela TV e desvinculação pelo celular em sessões distintas. A TV volta ao QR e o celular fica autenticado. Repetir como visitante para confirmar acesso sem Google. |

Registrar hash e versão do APK, versão da WebView, horários, resultado e capturas sem tokens, códigos ainda válidos ou dados pessoais. O Fire TV está acessível por ADB. Os pacotes instalados reportaram Positiva FM 1.1.0 e Positiva FM (Local) 1.1.1. A sessão real com Google e os testes físicos deste fluxo aguardam a preparação autorizada do ambiente de QA.

## Autorizações

1. **Leitura do projeto oficial.** Autorizar consulta de metadados do banco, políticas RLS, privilégios efetivos e configurações de Auth e backup. A consulta preparada não retorna registros de ouvintes nem tokens.
2. **Ensaio de recuperação oficial, se necessário.** Autorizar separadamente a restauração do ponto selecionado em outro ambiente isolado, com responsabilidade definida para os dados da cópia.
3. **Testes físicos.** Autorizar o uso ou a configuração do cliente Google OAuth de teste e a instalação do APK de QA no Fire TV. O login Google deve ser concluído pelo responsável pela conta de teste.
4. **Produção, após os bloqueadores e testes.** Autorizar separadamente a aplicação das duas migrations e a publicação coordenada das Edge Functions e do frontend.
