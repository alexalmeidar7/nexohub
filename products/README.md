# Produtos do ecossistema House Mix

Este diretório reserva espaços para os produtos que serão desenvolvidos como extensões do House Mix. Cada subpasta contém o escopo inicial e será expandida quando o respectivo projeto começar.

## Produtos atuais e existentes

- **House Mix Online:** aplicação principal existente neste repositório (`src/`).
- **House Mix Desktop:** aplicativo Electron em `desktop/`, com host local em evolução.
- **TV Player:** aplicativo iniciado em `firetv/`.
- **Video Wall:** consta como integrado no escopo fornecido; validar sua localização e integração ao iniciar evolução dedicada.
- **Nexo Preview:** ferramenta interna em `nexo-preview/`, fora dos produtos entregues ao cliente.

## Produtos reservados

- `chatbot/` — atendimento integrado ao House Mix.
- `site/` — presença web pública da rádio.
- `player-ott/` — player multiplataforma (Web, TV e mobile).
- `app-mobile/` — aplicativo completo da rádio.
- `android-auto/` e `apple-carplay/` — experiências automotivas.
- `social/` — integrações e agendamento para redes sociais.
- `gestao-x/` — gestão comercial dos produtos e anúncios Nexo.

Alexa é um serviço de assessoria Nexo, não um produto deste diretório.

## Regras de integração

1. House Mix é o núcleo dos dados da rádio; cadastrar uma vez e reutilizar nos produtos.
2. Desktop deve manter operação local autônoma; Online amplia acesso, gestão remota e distribuição.
3. Produtos devem ser modulares, com interfaces próprias e contratos de dados/APIs compartilhados.
4. Não criar fontes de verdade duplicadas para dados que já pertencem ao House Mix.
5. Não presumir sincronização ou modo offline concluídos: registrar o estado real em cada projeto.
6. Alterações de banco seguem migrations versionadas e as regras de preservação de dados de `AGENTS.md`.

Os READMEs abaixo são pontos de partida, não indicam que os produtos estejam implementados.
