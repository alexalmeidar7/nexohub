# NexoHub Bridge (Windows x64)

Conector local para encaminhar comandos autorizados do NexoHub ao vMix pela rede local. O executável será publicado pelo workflow Build NexoHub Bridge (Windows) como artefato do GitHub Actions.

## Segurança
- O Bridge só executa caminhos sob `/api/` no host/porta configurado em `VmixUrl`.
- A conexão com a nuvem usa HTTPS.
- O token é secreto e deve ser tratado como credencial. Não publique nem compartilhe `appsettings.json`.
- Não abra a porta 8088 do vMix para a internet.

## Estado
O agente Windows é a base do conector. Para funcionar em produção, depende das funções de pareamento, fila de comandos e resultado no Supabase e da integração do Switcher com essa fila.
