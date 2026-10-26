# 🔴 REGRA MESTRE — PROTEÇÃO ABSOLUTA DO BANCO DE DADOS

Estas regras são PERMANENTES e OBRIGATÓRIAS para todo o projeto NexoHub / Antigravity.

O banco de dados contém DADOS REAIS DE USUÁRIOS.

A prioridade máxima do sistema é:

**NUNCA PERDER, APAGAR, SOBRESCREVER OU CORROMPER DADOS EXISTENTES.**

Nenhuma alteração de código, interface, funcionalidade, schema ou arquitetura pode violar essa regra.

---

# 1. REGRA ABSOLUTA DE PRESERVAÇÃO

NUNCA:

* apagar dados existentes;
* resetar o banco;
* recriar o banco;
* recriar tabelas existentes de forma destrutiva;
* truncar tabelas;
* excluir registros em massa;
* substituir dados existentes;
* sobrescrever dados de usuários;
* alterar IDs existentes;
* alterar relacionamentos existentes sem necessidade;
* executar comandos destrutivos automaticamente;
* utilizar dados mock dentro do banco real.

Os dados existentes devem ser considerados **IMUTÁVEIS POR PADRÃO**.

Qualquer alteração de dados existentes exige uma necessidade explícita e autorização prévia.

---

# 2. COMANDOS PROIBIDOS POR PADRÃO

NUNCA executar automaticamente:

```sql
DROP DATABASE
DROP SCHEMA
DROP TABLE
TRUNCATE
DELETE
```

Também bloquear qualquer equivalente através de ORM, framework, CLI ou script.

Exemplos de operações proibidas:

```bash
db reset
database reset
migrate reset
schema reset
db push --force
```

ou qualquer comando equivalente que possa destruir ou substituir dados.

Também é proibido utilizar:

```sql
DELETE FROM tabela;
DELETE FROM tabela WHERE ...;
TRUNCATE TABLE tabela;
DROP TABLE tabela;
```

sem autorização explícita.

---

# 3. PROTEÇÃO CONTRA DELETE

O sistema deve assumir que:

**DELETE é uma operação potencialmente destrutiva.**

Antes de qualquer DELETE:

1. identificar exatamente quais registros serão afetados;
2. verificar se existem relacionamentos;
3. verificar se existe backup;
4. avaliar impacto;
5. interromper a operação;
6. solicitar autorização explícita.

Nunca transformar uma alteração estrutural em DELETE.

Nunca utilizar DELETE como forma de "limpar" dados durante desenvolvimento.

---

# 4. TRUNCATE É EXPRESSAMENTE PROIBIDO

Nunca utilizar:

```sql
TRUNCATE
```

em nenhuma tabela que contenha ou possa conter dados reais.

Mesmo que seja apresentado como:

* limpeza;
* manutenção;
* correção;
* teste;
* atualização;
* migração;
* preparação do ambiente.

A operação deve ser bloqueada.

---

# 5. DROP TABLE É EXPRESSAMENTE PROIBIDO

Nunca executar:

```sql
DROP TABLE
```

em tabelas existentes.

Se uma mudança estrutural exigir a substituição de uma tabela:

NÃO execute automaticamente.

Primeiro:

1. analisar a estrutura;
2. identificar os dados;
3. criar estratégia de migração;
4. preservar os registros;
5. validar relacionamentos;
6. criar backup;
7. solicitar autorização se houver qualquer risco.

---

# 6. MIGRATIONS — REGRA OBRIGATÓRIA

Toda alteração estrutural deve ser realizada através de:

**MIGRATION VERSIONADA.**

Nunca alterar o schema de produção manualmente sem migration.

Exemplos de alterações que devem utilizar migration:

* adicionar tabela;
* adicionar coluna;
* alterar coluna;
* criar índice;
* remover índice;
* adicionar constraint;
* alterar relacionamento;
* adicionar foreign key;
* alterar enum;
* adicionar RLS;
* alterar políticas;
* criar funções;
* criar triggers.

Cada migration deve:

* ser pequena;
* ter objetivo específico;
* ser rastreável;
* preservar dados;
* ser revisável;
* ser executável de forma segura;
* evitar operações destrutivas.

---

# 7. MIGRATIONS DEVEM SER ADITIVAS POR PADRÃO

Sempre que possível, prefira:

```sql
ALTER TABLE ... ADD COLUMN
```

em vez de recriar a tabela.

Prefira:

```sql
CREATE INDEX
```

em vez de modificar estruturas existentes de maneira destrutiva.

Prefira adicionar uma nova estrutura e migrar gradualmente em vez de destruir a estrutura antiga.

---

# 8. ALTERAÇÃO DE COLUNAS EXISTENTES

Nunca alterar uma coluna existente diretamente se houver risco de perda de dados.

Exemplo:

Se for necessário alterar:

```text
VARCHAR → INTEGER
```

não converter automaticamente todos os registros.

Primeiro:

1. verificar os valores existentes;
2. identificar valores incompatíveis;
3. criar estratégia de migração;
4. preservar os valores;
5. validar;
6. somente depois alterar a estrutura.

---

# 9. RENOMEAR COLUNAS

Ao renomear uma coluna:

* preservar os dados;
* atualizar código;
* atualizar queries;
* atualizar índices;
* atualizar foreign keys;
* atualizar RLS;
* atualizar triggers;
* atualizar views;
* atualizar funções;
* atualizar APIs.

Nunca criar uma coluna nova e simplesmente abandonar a antiga sem estratégia de migração.

---

# 10. REMOÇÃO DE COLUNAS

A remoção de uma coluna existente é considerada:

**OPERAÇÃO DESTRUTIVA.**

Nunca remover automaticamente.

Se uma coluna aparentemente não é mais utilizada:

1. verificar referências;
2. verificar dados;
3. verificar código;
4. verificar APIs;
5. verificar relatórios;
6. verificar RLS;
7. verificar triggers;
8. verificar dependências.

Depois disso, solicitar autorização antes da remoção.

---

# 11. FOREIGN KEYS

Toda foreign key deve ser analisada cuidadosamente.

NUNCA assumir automaticamente:

```sql
ON DELETE CASCADE
```

porque CASCADE pode apagar dados relacionados.

Por padrão, utilizar comportamento que impeça exclusões acidentais, quando compatível com o modelo.

Exemplo preferencial:

```sql
ON DELETE RESTRICT
```

ou equivalente suportado pelo banco.

Somente utilizar:

```sql
ON DELETE CASCADE
```

quando:

1. o relacionamento realmente exigir exclusão em cascata;
2. a exclusão dos registros filhos for intencional;
3. o impacto estiver documentado;
4. houver backup;
5. houver autorização explícita.

---

# 12. REGRA ESPECIAL PARA ON DELETE CASCADE

É PROIBIDO adicionar:

```sql
ON DELETE CASCADE
```

automaticamente em tabelas existentes.

Antes de utilizar CASCADE, identificar:

* tabela pai;
* tabela filha;
* quantidade de registros relacionados;
* profundidade dos relacionamentos;
* quais dados seriam excluídos;
* se existem outras tabelas dependentes.

Nunca utilizar CASCADE simplesmente porque "resolve o relacionamento".

---

# 13. SOFT DELETE

Quando uma funcionalidade exigir exclusão lógica de dados, preferir:

```text
deleted_at
```

ou equivalente.

Exemplo:

```sql
deleted_at TIMESTAMP NULL
```

Nesse modelo:

* o registro não é fisicamente apagado;
* o sistema apenas marca como removido;
* os dados permanecem recuperáveis.

Não implementar hard delete sem autorização.

---

# 14. BACKUP ANTES DE MIGRATIONS IMPORTANTES

Antes de migrations que possam alterar estruturas críticas:

1. verificar existência de backup;
2. garantir que o backup seja recente;
3. executar a migration;
4. validar a estrutura;
5. validar quantidade de registros;
6. validar relacionamentos;
7. validar integridade.

Se não houver backup confiável e a operação apresentar risco:

**PARAR.**

Não executar automaticamente.

---

# 15. VALIDAÇÃO ANTES E DEPOIS DA MIGRATION

Antes da migration, registrar:

* quantidade de tabelas;
* quantidade de registros das tabelas afetadas;
* estrutura das tabelas;
* índices;
* foreign keys;
* constraints;
* policies;
* triggers.

Depois da migration:

* comparar estrutura;
* verificar registros;
* verificar integridade;
* verificar foreign keys;
* verificar RLS;
* verificar policies;
* verificar funcionamento da aplicação.

Uma migration só deve ser considerada concluída após validação.

---

# 16. PROIBIDO MOCK DATA NO BANCO REAL

NUNCA inserir:

* usuários fictícios;
* clientes fictícios;
* pedidos fictícios;
* produtos fictícios;
* empresas fictícias;
* nomes fictícios;
* dados de demonstração ou registros de teste em tabelas com dados de produção.

Ambientes de desenvolvimento ou testes que precisem de mocks devem operar isolados em memória local, mocks de código ou bancos de dados locais e descartáveis, NUNCA no banco real de usuários.
- GitHub Action `.github/workflows/build-check.yml` typechecks and builds every push; keep it passing so broken GitHub commits are caught before they freeze the Lovable preview.
- Global music synchronization uses completion-based polling with failure backoff and immediate realtime events; never overlap requests or repeat successful track enrichment, to bound Cloud traffic while preserving live updates.
