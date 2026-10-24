# Prova técnica do motor de horários (E2)

A geração desta entrega é uma ferramenta técnica executada no worker, por CLI. Não altera cadastros nem aplica uma grade. A integração com planejamento, fila durável, autenticação e interface continua nas etapas previstas no plano.

## Executar

Requer Node 24 e dependências instaladas. Os comandos abaixo partem da raiz do repositório. As saídas de trabalho ficam em `privado/`, ignorada pelo Git e pelo contexto Docker.

```powershell
New-Item -ItemType Directory -Force -Path privado/e2 | Out-Null
pnpm engine:fixture docs/testing/engine-synthetic-volume.json privado/e2/demo-input.json
pnpm engine:solve privado/e2/demo-input.json
pnpm benchmark:engine privado/e2/demo-input.json privado/e2/demo-report.json 3 512
```

O gerador sintético constrói uma testemunha válida para conferir os dados e não inclui essa grade na entrada enviada ao motor. O arquivo de volume versionado é inteiramente inventado e não foi extraído de uma escola. Entradas e relatórios dimensionados por dados reais permanecem locais, mesmo quando usam identificadores anônimos.

Para executar no container, copie somente uma entrada fictícia:

```powershell
docker compose cp privado/e2/demo-input.json worker:/tmp/engine-input.json
docker compose exec -T worker node apps/worker/src/generation/cli.ts /tmp/engine-input.json
```

## Contrato

A entrada contém `snapshot` e `options`. O esquema executável está em `packages/contracts/src/generation.ts`. O snapshot requer regras explícitas para cada disciplina na turma e períodos autorizados de hora-atividade, além dos cadastros, horários, cargas e fixações. A [ADR 0010](../adr/0010-motor-de-referencia-e-validacao.md) define as restrições e as limitações.

As opções são: limite de busca em milissegundos (1 a 300 mil), limite total de nós, semente inteira sem sinal e heap antigo da thread em MiB (16 a 1024). A prova sintética usa 30 segundos, dois milhões de nós e 256 MiB de heap. O benchmark aceita um limite separado de RSS; os exemplos usam 512 MiB. Essas são metas técnicas provisórias, registradas antes das medições, não metas pactuadas com a secretaria.

A saída JSON inclui estado, motivo de parada, revisão de origem, diagnósticos e contadores. Só `feasible` inclui proposta completa. O CLI acrescenta versão do motor, hash SHA-256 da entrada normalizada e pico de RSS do processo. Entrada ilegível ou fora do contrato também produz resultado estruturado, com hash nulo quando não há entrada válida.

| Código de saída | Estado                             |
| --------------- | ---------------------------------- |
| 0               | Solução viável validada            |
| 1               | Falha técnica ou proposta inválida |
| 2               | Arquivo/modelo/opções inválidos    |
| 3               | Inviabilidade comprovada no modelo |
| 4               | Busca inconclusiva                 |
| 130             | Cancelamento                       |

O CLI atende SIGINT/SIGTERM. Na composição do worker, `runGeneration` recebe `AbortSignal`, preserva a revisão copiada e descarta resultado posterior ao cancelamento.

## Resultado publicável

As medições completas do cenário fictício estão em [engine-synthetic-report.json](engine-synthetic-report.json). Foram usadas três sementes sequenciais, com um processo novo por execução. O relatório registra CPU, sistema, Node, hashes, limites e métricas; o coordenador valida novamente cada proposta.

| Semente | Busca (ms) | Total (ms) | Pico RSS (MiB) | Minutos vagos | Resultado |
| ------- | ---------- | ---------- | -------------- | ------------- | --------- |
| 11      | 99.5       | 497.9      | 119.9          | 34070         | feasible  |
| 12      | 97.4       | 488.8      | 120.0          | 34490         | feasible  |
| 13      | 99.8       | 506.7      | 120.3          | 35020         | feasible  |

A duração de busca não inclui a inicialização do Node nem a validação final. O tempo total inclui o processo isolado e a conferência do coordenador. A aprovação do benchmark exige sucesso nas três execuções, duração dentro do limite, tempo total até o limite mais dois segundos e RSS dentro do orçamento. RSS indisponível ou zero não é aceito como medição válida.

O objetivo da prova é correção e viabilidade dentro dos limites. Não houve otimização de janelas: os minutos vagos são apenas medidos. Não se deve usar o cenário fictício como afirmação de que uma grade escolar específica está homologada. Depois da E2, a [ADR 0015](../adr/0015-preferencias-na-geracao.md) acrescentou a melhoria de janelas e da distribuição das disciplinas pelos dias, com critérios em ordem de prioridade.

## Testes e limites

- Soluções conhecidas e casos sem solução; comparação com enumeração independente em casos pequenos.
- Conflitos por horário real, inclusive entre turnos com IDs distintos; fim/início coincidentes são permitidos.
- Carga exata, equipe compartilhada, limite diário entre blocos, geminadas, disponibilidade, recursos opcionais e HA.
- Fixações de aula/HA, falso sucesso de adaptador, timeout, limite de nós e cancelamento.
- Thread real, CLI sem banco e benchmark em processos separados.

O relatório é uma medição local, não um teste de desempenho obrigatório na CI. A CI exercita cenários determinísticos e o protocolo real. Os benchmarks dimensionados pelo levantamento e pelo crescimento foram executados localmente com resultados preservados em `privado/e2/`; seus volumes e medições não são publicados.

**Antes de E6:** pactuar metas no hardware da escola e repetir o benchmark com políticas e restrições completas. A prova não implementa aulas assíncronas, atividades sem turma nem preferências. Recursos especiais continuam opcionais até confirmação; o contrato do motor já permite ocupação exclusiva sem criar cadastro desses recursos nesta entrega.
