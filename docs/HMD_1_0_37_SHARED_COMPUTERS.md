# HMD v1.0.37 — Cadastro compartilhado de computadores

A seção Configurações > Sincronização entre computadores permite dar nome a este HMD, listar os demais dispositivos da mesma emissora, definir um único principal e transformar automaticamente os outros em secundários no cadastro compartilhado.

- Identificador do computador gerado uma vez no processo nativo (Electron) e conservado no perfil do Windows.
- Tabelas isoladas por emissora, com RLS, e chamadas RPC que verificam o usuário.
- Somente o titular da rádio pode definir outro computador como principal; a seleção central é atômica por estação.
- Nome personalizado não é perdido ao reabrir o HMD.
- A lista acompanha eventos Realtime enquanto a seção está aberta, sem consultar o Supabase a cada segundo.
- Nenhum outro tenant pode consultar dados dos computadores cadastrados de outra rádio.
- LAN não ativada: cada HMD continua acessando a nuvem até existir transporte autenticado, criptografado e testado; o chip do banco não anuncia leituras do principal que não ocorreram.
- O XML Tempo foi corrigido diretamente em produção para a Interativa e não faz parte desta PR.

## Publicação
1. Validar TypeScript/build e testes nativos.
2. Aplicar a migração `20261123205000_hmd_station_shared_device_registry.sql` no Supabase oficial antes do deploy do frontend.
3. Merge da PR e verificar deploy Hostinger (HMO) e workflow `House Mix Desktop Release`.
4. Confirmar release com executável `House-Mix-Desktop-1.0.37-Setup.exe`, blockmap e latest.yml.
5. Homologar com dois HMDs reais: renomear computadores, promover secundário e verificar atualização da lista nas duas máquinas.

**Não confundir o cadastro de funções com a comunicação entre máquinas.** O transporte LAN permanece desativado por segurança.
