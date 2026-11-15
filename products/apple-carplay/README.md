# Apple CarPlay

Produto em desenvolvimento. Integração automotiva que consome rádio, programação, músicas e demais informações do House Mix.

## Direção arquitetural

- House Mix é a referência dos dados centrais da rádio.
- Reutilizar APIs, contratos e dados existentes antes de propor novas fontes de dados.
- Manter este produto modular e permitir que falhas nele não interrompam a operação local do House Mix Desktop.
- Definir autenticação, permissões, sincronização e comportamento offline antes de integrar dados reais.
- Não conectar este projeto a um banco de produção nem executar alterações de schema sem migration versionada e validação.

## Estado

Esta pasta é um espaço reservado. O código e a arquitetura específicos serão definidos quando o desenvolvimento deste produto começar.
