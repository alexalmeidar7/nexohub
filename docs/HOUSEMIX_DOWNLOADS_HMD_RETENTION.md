# House Mix · Downloads e retenção de versões Windows

## Onde ficam os instaladores
O HMD é publicado em **GitHub Releases** no repositório `alexalmeidar7/nexohub`.
A página **Ferramentas > Downloads** consulta a última release publicada na API pública do GitHub, sem requisições ao Supabase, e apresenta o House Mix Desktop com versão, data/hora de Brasília, tamanho, principais novidades e botão Baixar. O Nexo Bridge continua disponível como uma segunda ferramenta.

## Notas de atualização
- A publicação de novas versões no workflow `.github/workflows/housemix-desktop-release.yml` usa `--generate-notes`, gerando um resumo dos PRs/commits integrados.
- A release 1.0.31 foi publicada anteriormente apenas com a descrição genérica; a página tem notas específicas validadas da PR #302 para essa versão.
- Se não houver notas úteis para uma versão futura, a página informa que os detalhes não estão disponíveis; não inventa alterações.
- Se não conseguir verificar a release ou o executável correspondente, o botão fica indisponível e oferece o link para a página oficial no GitHub.

## Política de retenção de armazenamento
**Após publicar com sucesso cada nova versão HMD**, `scripts/cleanup-hmd-releases.mjs` conserva apenas:
1. A release HMD atual (mais recente)
2. A versão HMD imediatamente anterior (backup 1)
3. A segunda versão HMD anterior (backup 2)

O script exclui os assets e tags das demais releases HMD antigas **somente** quando:
- a publicação mais recente já contém o instalador `House-Mix-Desktop-x.y.z-Setup.exe`, o `.blockmap` e o `latest.yml`;
- a release mais recente confirmada pelo GitHub é exatamente a que acabou de ser publicada;
- a release candidata à exclusão possui tag de versão `vX.Y.Z`, não é draft/prerelease e contém o instalador HMD correspondente;
- a autenticação tem escopo de escrita do repositório no job do GitHub Actions.

**Nexo Bridge, Player TV, outros produtos, releases sem instalador HMD e repositórios externos NÃO são excluídos.** A limpeza libera espaço do GitHub Releases; não apaga nem altera arquivos na Hostinger.

Exemplo: ao publicar a versão 1.0.32, serão mantidas 1.0.32, 1.0.31 e 1.0.30. As demais releases HMD antigas serão apagadas. Usuários muito antigos deverão atualizar para uma das versões preservadas.

## Validação
`bunx vitest run src/lib/desktopRelease.test.ts`
`node --test scripts/cleanup-hmd-releases.test.mjs`
`node scripts/cleanup-hmd-releases.mjs --published v1.0.32` mostra uma prévia (requer token GitHub); só a flag `--apply` efetiva a exclusão.

Todo novo release é gerado automaticamente após o build da main passar; a retenção é o último passo do mesmo workflow, depois de publicar o instalador e o manifesto. O histórico completo dos commits permanece no GitHub mesmo após excluir releases antigas.
