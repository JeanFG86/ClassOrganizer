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

O usuário precisa começar por uma letra sem acento e ter de 4 a 40 caracteres; depois aceita letras sem acento, números, ponto, hífen e sublinhado. A senha precisa ter de 15 a 128 caracteres, preservando espaços e acentos. O exemplo acima é apenas o formato: escolha outra senha.

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

Prepare os cadastros e abra **Planejamentos**. A criação captura os dados daquele momento; consulte cada revisão, confira regras/cargas e disponibilidade/hora-atividade e salve a conferência. Depois é possível concluir a revisão ou copiar o planejamento. Uma cópia sempre pede nova conferência.

Para incorporar alterações posteriores dos cadastros, conclua a revisão atual e abra **Novo rascunho com os cadastros atuais**. Concluir não gera nem publica a grade. Administradores podem arquivar/restaurar planejamentos. Todos os perfis podem consultar e baixar as revisões; arquivos baixados contêm dados da organização e devem permanecer no ambiente de trabalho autorizado.

**Auditoria** apresenta as ações, responsáveis e registros, com paginação. Somente administradores acessam essa tela. Ela não oferece edição nem exclusão do histórico.

## E2E

Use banco de teste e dados inteiramente fictícios. Antes da primeira suíte, crie o administrador pela mesma CLI com usuário `e2e-admin` e senha `senha ficticia e2e 2026!`. Esses valores são fixtures públicas de teste, não credenciais para uma instalação real. Credenciais diferentes podem ser passadas por `E2E_USERNAME` e `E2E_PASSWORD`.

O setup do Playwright faz login e grava a sessão temporária em `tests/e2e/.auth/`, ignorada pelo Git e pelo Docker. A CI inicializa um banco descartável, cria esse administrador fictício e executa o mesmo fluxo; não existe modo de produção que desabilite a autenticação.
