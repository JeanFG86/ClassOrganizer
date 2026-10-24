# ADR 0016 — Recursos especiais opcionais: cadastro próprio e reserva pelo bloco de aulas

- **Status:** aceita
- **Data:** 24/10/2026
- **Etapa:** E3, item "configuração dos recursos especiais"
- **Relacionadas:** ADRs [0005](0005-concorrencia-otimista-e-arquivamento.md), [0009](0009-aulas-compartilhadas.md), [0010](0010-motor-de-referencia-e-validacao.md), [0012](0012-planejamentos-e-revisoes.md) e [0013](0013-grade-manual.md)

## Contexto

O plano (seção 2.2) condiciona salas, laboratório, quadra e outros recursos a uma confirmação da escola: eles só entram se forem uma restrição real. A escola ainda não respondeu se algum espaço atende uma turma de cada vez.

O contrato do motor e o validador independente já tratam recursos exclusivos desde a E2 ([ADR 0010](0010-motor-de-referencia-e-validacao.md)), mas a tradução da revisão enviava a lista vazia. O usuário decidiu oferecer recursos como **configuração opcional**: a secretaria cadastra se e quando precisar, e quem não cadastrar não vê diferença.

## Decisão

### O cadastro

- Recurso especial é um cadastro por nome, como disciplina e turma, no módulo `school-structure`:
  - o nome tem até 60 caracteres, sem repetição, ignorando maiúsculas, acentos e espaços extras;
  - a versão é otimista;
  - o recurso pode ser arquivado e restaurado, sem exclusão ([ADR 0005](0005-concorrencia-otimista-e-arquivamento.md)).
- A tela "Recursos especiais" (`/recursos`) usa o mesmo componente dos cadastros por nome. O componente passou a concordar com substantivos masculinos ("Recurso cadastrado").

### A reserva fica no bloco

- Cada bloco de aulas ([ADR 0009](0009-aulas-compartilhadas.md)) pode indicar até 5 recursos, sem repetição. Todas as aulas do bloco ocupam esses recursos.
- A escolha fica no bloco, e não na disciplina ou na turma: o mesmo componente curricular pode usar a quadra numa turma e a sala comum em outra, e um bloco com dois professores pode ocupar dois espaços.
- A tabela `assignment_resource` liga bloco e recurso, com a ordem de exibição:
  - a FK para o recurso impede excluí-lo enquanto um bloco o usa;
  - a ligação é removida junto com o bloco;
  - um `CHECK` limita a posição a cinco recursos.
- Ao criar um bloco, recursos não informados resultam em lista vazia. Ao editar, não informar os recursos mantém os atuais. Assim, clientes que ainda não conhecem o campo não apagam a reserva.
- Um recurso novo no bloco precisa existir e estar ativo. Um recurso já marcado pode continuar no bloco depois de arquivado, como acontece com as disciplinas dos participantes.

### Fotografia, grade e geração

- A fotografia da revisão ([ADR 0012](0012-planejamentos-e-revisoes.md)) passa a guardar a lista de recursos, e cada bloco guarda os seus. As fotografias antigas não têm esses campos e são lidas como "sem recursos". O `CHECK` da fotografia não muda.
- A tradução para o validador e o motor considera só os recursos ativos da fotografia. Um recurso arquivado deixa de reservar horários nas revisões criadas depois do arquivamento. As revisões existentes mantêm a fotografia do momento da captura.
- A grade manual ([ADR 0013](0013-grade-manual.md)) acusa `conflict.resource` quando dois blocos ocupam o mesmo recurso em horários sobrepostos, com o nome do recurso na mensagem. A geração automática já respeita a exclusividade, com a busca, a melhoria de preferências e a conferência final.
- A grade mostra os recursos do bloco junto do professor ou da turma, e a fotografia da revisão os lista.

## Consequências

- A secretaria pode configurar quadra, laboratórios ou equipamentos quando a escola confirmar a necessidade, sem nova etapa de desenvolvimento.
- Sem recursos cadastrados, telas, grade e geração ficam como antes, e o formulário das atribuições nem mostra a escolha.
- Continuam fora do escopo:
  - capacidade maior que um bloco por vez (por exemplo, uma quadra para duas turmas);
  - recursos com horários indisponíveis;
  - uma visão da grade por recurso.

  Cada um pode virar configuração se a escola pedir.
