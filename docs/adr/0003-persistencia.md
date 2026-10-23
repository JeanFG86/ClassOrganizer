# ADR 0003 — Persistência com PostgreSQL e Prisma

- **Status:** aceita
- **Data:** 22/10/2026

## Decisão

- PostgreSQL 18 é a fonte oficial dos dados.
- Prisma 7.10 com o gerador `prisma-client` e o driver adapter `@prisma/adapter-pg`, isolado em `packages/infrastructure`. O cliente gerado fica em `src/generated/prisma` (fora do Git, criado no `postinstall`).
- Modelos do Prisma não são entidades: cada repositório traduz registro ↔ domínio (`toDomain`).
- Migrações versionadas em `packages/infrastructure/prisma/migrations`, revisadas no PR. Invariantes que o Prisma não expressa (por exemplo, `CHECK`) são escritas à mão no SQL da migração.
- Em produção/uso local, o serviço `migrate` do Compose roda `prisma migrate deploy` uma vez antes da API e do worker. Não usamos `db push` nem sincronização automática.
- Unicidade é garantida pelo banco (índice único) e traduzida pelo repositório para o erro de domínio correspondente. A checagem prévia no caso de uso existe para a mensagem, não como garantia.
- Testes de persistência usam PostgreSQL real em Testcontainers (`src/testing/postgres-container.ts`), aplicando as mesmas migrações do produto.

## Pendências

- Porta de transação (unit of work) para casos de uso que gravam em mais de um agregado: criar na primeira necessidade real (E3/E4), sem expor o cliente Prisma ao core.
- Revisão otimista (`revision`) e auditoria: E4.
- A imagem de runtime ainda inclui o CLI do Prisma, instalado como _peer dependency_ do `@prisma/client`. Reduzir o tamanho da imagem quando a operação local for tratada (E8).
