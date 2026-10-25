# Primeiro acesso e operação das contas

Suba o Compose conforme o README. Não existe usuário ou senha padrão da aplicação. A senha do PostgreSQL é uma credencial diferente da senha de entrada no EntreAulas.

## Criar o primeiro administrador

No computador responsável pela instalação, crie um arquivo UTF-8 em `privado/admin-inicial.json`, com este formato e credenciais escolhidas para a instalação:

```json
{
  "username": "seu-usuario",
  "password": "substitua por uma frase secreta longa"
}
```

O usuário precisa começar por uma letra sem acento e ter de 4 a 40 caracteres; depois aceita letras sem acento, números, ponto, hífen e sublinhado. A senha precisa ter de 5 a 128 caracteres, preservando espaços e acentos. No PowerShell do Windows, prefira senhas sem acentos ao enviar o arquivo pela CLI: o terminal pode trocar caracteres acentuados. O exemplo acima é apenas o formato: escolha outra senha.

Em PowerShell:

```powershell
Get-Content -Raw -Encoding utf8 privado/admin-inicial.json |
  docker compose exec -T api node apps/api/src/bootstrap-admin.ts
Remove-Item -LiteralPath privado/admin-inicial.json
```

Em Bash:

```bash
docker compose exec -T api node apps/api/src/bootstrap-admin.ts < privado/admin-inicial.json
rm privado/admin-inicial.json
```

A senha entra pela entrada padrão e não pelos argumentos do processo. O comando só funciona enquanto não há nenhuma conta; duas execuções simultâneas não criam dois administradores. Não encaminhe o arquivo nem o versione. `privado/` já é ignorada pelo Git e pelo contexto Docker.

No desenvolvimento com API fora do Compose, o equivalente é `pnpm admin:create < privado/admin-inicial.json` no Bash, ou o mesmo `Get-Content ... | pnpm admin:create` no PowerShell. O script lê `.env` da raiz. Use `APP_ORIGIN=http://localhost:5173` ao acessar pelo Vite.

Abra a interface, entre e use **Acessos** para criar contas individuais. **Minha conta** troca a própria senha; a troca encerra todas as sessões dessa conta. Mantenha outro administrador ativo para administrar seu acesso se necessário. Alterar papel, redefinir senha ou desativar uma conta também encerra todas as sessões dela. A aplicação não permite apagar contas nem desativar/rebaixar o próprio administrador.

## Endereço e sessão

- `APP_ORIGIN` deve ser a origem exata da interface, sem caminho ou barra final. No Compose local: `http://localhost:8080`. Ao mudar a porta ou usar outro hostname, ajuste também essa variável e recrie a API.
- O Compose publica a interface somente em `127.0.0.1` por padrão. Para disponibilizar em rede, configure HTTPS e a origem correspondente; o cookie passa a exigir conexão segura. Não publique HTTP com dados da escola.
- Cada sessão dura até oito horas. Use **Sair** ao terminar. Se a saída falhar por conexão, a interface informa o erro; tente novamente antes de deixar o computador.
- Após muitas tentativas de entrada, aguarde quinze minutos. O limite por endereço é compartilhado pelos acessos através do proxy local.
- Não há recuperação por e-mail ou criação de outro primeiro administrador sobre um banco já inicializado. Não apague tabelas nem volumes para recuperar acesso; a operação de recuperação e backup será detalhada na E8.

## Planejamentos

Prepare os cadastros e abra **Planejamentos**. A criação captura os dados daquele momento. Consulte os dados da revisão, confira cada item do **Checklist de conferência** e salve a conferência. Depois é possível concluir a revisão ou copiar o planejamento. Uma cópia sempre pede nova conferência.

### Checklist de conferência

O checklist tem cinco itens: **Disciplinas, turnos e turmas**, **Professores e habilitações**, **Atribuições, cargas e recursos**, **Disponibilidade e hora-atividade** e **Regras da grade**. Concluir exige os cinco. Alterar as regras da grade desmarca o item das regras.

- **Pontos de atenção** indicam dados que ficam fora da grade ou que provavelmente precisam de ajuste: turmas sem turno, professores sem atribuições ou acima da carga máxima, disponibilidade insuficiente para aulas e hora-atividade, entre outros. São avisos. Corrija nos cadastros e abra outro rascunho, ou confirme que estão corretos.
- **Alterações** comparam a revisão com a anterior ou, numa cópia, com a revisão de origem. Itens sem alteração também precisam ser confirmados: a disponibilidade de um professor pode ter mudado de um ano para o outro sem ter sido atualizada no cadastro.

### Preparar o ano seguinte

Atualize os cadastros (professores que chegaram ou saíram, turmas, disponibilidade) e use **Copiar** no planejamento do ano anterior. Em **Dados da cópia**, mantenha **Cadastros atuais, para preparar o próximo período**. Com **Trazer a grade da origem como ponto de partida**, a grade anterior é reaproveitada; alocações de turmas, blocos ou professores que deixaram de existir são descartadas e o histórico da grade informa quantas. As regras da grade vêm da origem. Escolha **Mesma fotografia da última revisão da origem** para copiar exatamente os dados do planejamento original. O planejamento de origem não muda.

Para incorporar alterações posteriores dos cadastros, conclua a revisão atual e abra **Novo rascunho com os cadastros atuais**. Concluir não gera nem publica a grade. Administradores podem arquivar/restaurar planejamentos. Todos os perfis podem consultar e baixar as revisões; arquivos baixados contêm dados da organização e devem permanecer no ambiente de trabalho autorizado.

**Auditoria** apresenta as ações, responsáveis e registros, com paginação. Somente administradores acessam essa tela. Ela não oferece edição nem exclusão do histórico.

### Guardar e recuperar alternativas da grade

Abra um planejamento e use **Versões do planejamento**. Escolha a revisão de origem para nomeá-la, compará-la com outra ou restaurá-la. O nome é opcional e também pode identificar uma revisão concluída.

- **Preservar revisão e continuar** guarda o rascunho atual no histórico e abre uma cópia para continuar os ajustes. Não exige grade completa e não conclui a revisão. Salve o nome antes, se desejar identificar a alternativa guardada.
- **Comparar revisões** mostra o que saiu, entrou e permaneceu na grade, além das mudanças nos cadastros e regras. Trocas de horário e fixação aparecem como remoção e inclusão. Consulte os dados de cada revisão abaixo para conferir detalhes de cargas, disponibilidade e regras.
- **Restaurar revisão** pede confirmação e abre um novo rascunho com os dados, regras e grade originais. O rascunho anterior continua no histórico. A restauração não usa os cadastros atuais, não altera a revisão original e exige nova conferência.

Só o último rascunho pode receber alterações na grade. As revisões anteriores continuam disponíveis para consulta, comparação e restauração. Todos os perfis podem comparar; somente administrador e editor podem nomear, preservar e restaurar revisões de planejamentos ativos.

## Imprimir horários e salvar PDF

Em **Planejamentos**, abra o planejamento e use **Impressão, PDF e XLSX** na revisão desejada. O link **Imprimir ou salvar PDF desta revisão**, na Grade, abre a mesma saída histórica.

Na página **Impressão e exportação**, escolha revisão, **Turma** ou **Professor**, e uma entidade ou todas. Confira a prévia e as pendências. O botão **Imprimir / salvar PDF** abre o diálogo do navegador; escolha a impressora ou **Salvar como PDF**. Use Chrome ou Edge atual, papel A4 em paisagem, escala padrão e sem cabeçalhos/rodapés adicionais do navegador. O relatório já repete sua identificação e numera as páginas.

Cada turma ou professor tem folhas próprias por turno. Folhas extensas continuam nas páginas seguintes. Os nomes e horários são os da revisão escolhida, mesmo que os cadastros tenham mudado depois. **RASCUNHO** indica uma revisão ainda não concluída; guardar ou imprimir não equivale a aprovar a grade.

A prévia permanece estável enquanto está aberta. Use **Atualizar prévia** para carregar mudanças posteriores no rascunho. Os PDFs são salvos no destino escolhido no navegador e devem permanecer no ambiente de trabalho autorizado.

## Baixar horários e cargas em XLSX

Na mesma página, use **Baixar XLSX da revisão completa**. A planilha contém toda a revisão selecionada, mesmo quando a prévia de impressão está filtrada por uma turma ou professor. Todos os perfis podem baixar.

- **Revisão:** identificação, situação, data da fotografia, versão e pendências. Rascunhos e revisões históricas ficam identificados em todas as abas.
- **Horários:** uma linha por bloco alocado ou HA, com dia, turno, hora inicial/final, turma, disciplinas, professores, recursos e fixação. Um bloco compartilhado aparece uma vez com todos os participantes.
- **Professores:** cargas de aulas cadastradas, exigidas e alocadas; HA exigidas e alocadas; carga máxima, quando informada.
- **Turmas:** configuração dos horários e cargas cadastradas, exigidas e alocadas. Um bloco conta uma vez para a turma.
- **Blocos:** todas as atribuições da fotografia, seus participantes, quantidade de aulas e situação de aplicação à grade. Blocos fora da modelagem permanecem visíveis aqui e na carga cadastrada.

As cargas usam unidades de aula, inclusive quando os horários têm durações diferentes. Horas são valores de horário local da grade; datas de identificação estão em UTC. Filtros e cabeçalhos congelados ajudam a consultar os dados. Os valores são uma fotografia, sem fórmulas de recálculo. Alterar o XLSX não muda a grade nem os cadastros: o banco continua sendo a fonte oficial.

Se o planejamento mudou desde a prévia, o download é recusado. Use **Atualizar prévia** e confira a revisão antes de baixar novamente. O arquivo é preparado no momento do download; não fica armazenado no servidor. Guarde-o no ambiente de trabalho autorizado.

## Importar cadastros por CSV

Use **Importar CSV** para cadastrar muitos itens de uma vez. Cadastre antes os turnos e horários na tela de turnos e importe nesta ordem: **Disciplinas**, **Turmas**, **Professores** e **Atribuições**, porque cada tipo usa os nomes dos anteriores.

1. Escolha o tipo e use **Baixar modelo** para obter o cabeçalho e linhas de exemplo inventadas. Apague os exemplos e preencha uma linha por item.
2. No Excel, salve com **Salvar como** e o tipo CSV. Ponto e vírgula, vírgula e tabulação são aceitos, em UTF-8 ou no formato antigo do Excel. Separe várias disciplinas ou recursos na mesma célula com `|`. Até 1.000 linhas por arquivo.
3. Escolha o arquivo. A prévia mostra cada linha com a situação (**Será cadastrada**, **Já cadastrada** ou **Com erro**) e as observações. Avisos não impedem a importação; erros, sim.
4. Corrija as linhas com erro na planilha e escolha o arquivo de novo. Com tudo certo, use **Importar**. Todas as linhas novas são gravadas juntas; se algo falhar, nada é gravado.

A importação só acrescenta cadastros: um item que já existe com o mesmo nome fica como está, e as alterações continuam nas telas de cada cadastro. Em **Atribuições**, linhas da mesma turma com o mesmo código em **Bloco** formam aulas simultâneas; reimportar o mesmo arquivo não duplica as cargas. Se outra pessoa alterar os cadastros de forma que o resultado de alguma linha mude entre a prévia e a confirmação, a importação é recusada; use **Gerar a prévia novamente**. Somente perfis de edição importam; a importação aparece na auditoria e vale para os rascunhos de planejamento abertos depois dela.

## E2E

Use banco de teste e dados inteiramente fictícios. Antes da primeira suíte, crie o administrador pela mesma CLI com usuário `e2e-admin` e senha `senha ficticia e2e 2026!`. Esses valores são fixtures públicas de teste, não credenciais para uma instalação real. Credenciais diferentes podem ser passadas por `E2E_USERNAME` e `E2E_PASSWORD`.

O setup do Playwright faz login e grava a sessão temporária em `tests/e2e/.auth/`, ignorada pelo Git e pelo Docker. A CI inicializa um banco descartável, cria esse administrador fictício e executa o mesmo fluxo; não existe modo de produção que desabilite a autenticação.
