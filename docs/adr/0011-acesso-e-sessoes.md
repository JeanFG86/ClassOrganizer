# ADR 0011 — Acesso local, papéis e sessões persistidas

- **Estado:** aceita
- **Data:** 2026-10-23
- **Etapa:** E4
- **Atualizada em:** 2026-10-24 (E8), quanto ao tamanho mínimo da senha

## Contexto

Os cadastros anteriores eram acessíveis sem autenticação. Antes de usar dados da escola, precisamos identificar quem altera cada registro e limitar as operações por perfil. A implantação inicial continua local, em uma única organização; não há compartilhamento público de planejamentos.

## Decisão

Usar contas locais com usuário normalizado e senha de 5 a 128 caracteres, sem senha padrão. A CLI `admin:create` recebe JSON pela entrada padrão, exige banco sem usuários e cria exatamente o primeiro administrador sob bloqueio transacional. Não existe rota HTTP de instalação. A senha não aparece em argumentos, logs ou auditoria. A criação subsequente é exclusiva de administradores.

Senhas usam `scrypt` do Node com sal aleatório de 128 bits, `N=32768`, `r=8`, `p=3`, saída de 64 bytes e comparação constante. Essa combinação consta na [orientação de armazenamento de senhas da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Os parâmetros pertencem ao formato atual; uma mudança exige versionar o formato e preservar a verificação das credenciais existentes.

Cada login cria um segredo aleatório de 256 bits. O PostgreSQL recebe somente SHA-256 desse segredo e expiração absoluta de oito horas. O cookie é `HttpOnly`, `SameSite=Strict`, sem `Domain`, com caminho `/api`; ganha `Secure` quando `APP_ORIGIN` usa HTTPS. Não há token no armazenamento local do navegador nem aceitação por URL ou `Authorization`. Saída revoga a sessão; mudança de perfil, desativação ou troca de senha revoga todas as sessões da conta. O papel e a atividade da conta são consultados novamente em cada operação.

A [orientação de sessões da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) fundamenta a geração e o armazenamento dos segredos. Escritas exigem o cabeçalho próprio `X-EntreAulas-Client: web`, conferem `Origin` quando presente e rejeitam `Sec-Fetch-Site: cross-site`. Não habilitamos CORS. Isso inclui login e saída, seguindo a [proteção de APIs com cabeçalho próprio da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Ferramentas locais podem usar o cabeçalho sem `Origin`; navegadores de outra origem não conseguem enviá-lo sem preflight autorizado.

Tentativas de login são contadas no PostgreSQL por hashes de usuário e endereço da conexão, em janela de quinze minutos: dez por usuário, trinta por endereço, além de duas verificações simultâneas por processo. Não confiamos em cabeçalhos de proxy para determinar o endereço. No Compose, o limite por endereço agrega o tráfego do Nginx; isso é conservador para a implantação local. Usuário ausente e senha incorreta produzem a mesma mensagem e derivação equivalente. Uma implantação com múltiplas réplicas ou proxy externo deve revisar esses limites e a configuração de origem.

## Autorização e integridade

| Operação                                                               | Administrador | Editor | Consulta |
| ---------------------------------------------------------------------- | ------------- | ------ | -------- |
| Ler cadastros e qualquer planejamento, inclusive arquivados            | Sim           | Sim    | Sim      |
| Baixar o JSON de uma revisão acessível                                 | Sim           | Sim    | Sim      |
| Cadastrar, editar, arquivar e restaurar cadastros; remover atribuição  | Sim           | Sim    | Não      |
| Criar/copiar planejamento, conferir e concluir revisão, abrir rascunho | Sim           | Sim    | Não      |
| Arquivar/restaurar planejamento                                        | Sim           | Não    | Não      |
| Gerenciar contas e ler auditoria                                       | Sim           | Não    | Não      |
| Trocar a própria senha e encerrar a própria sessão                     | Sim           | Sim    | Sim      |

Os planejamentos pertencem à organização, sem propriedade individual ou isolamento por autor. Conhecer um identificador não concede permissão adicional. Não há exclusão física de conta, planejamento, revisão ou auditoria pela API; atribuições ainda podem ser removidas da base de preparação, preservando revisões anteriores.

`makeAuthorizedOperation`, no core, verifica o ator antes de invocar o caso de uso. As regras específicas de contas e planejamentos também estão no core. A composição da API usa somente entradas protegidas. `AsyncLocalStorage` transporta apenas o hash da sessão entre HTTP e a porta de aplicação; o core não depende dele. A fábrica HTTP básica continua disponível para testes com casos de uso falsos; o processo de produção usa obrigatoriamente `createSecureApp`, sem chave de ambiente para desligar o acesso.

Para escritas, a unidade de trabalho bloqueia `app_state`, relê sessão e conta, executa o caso de uso e acrescenta a auditoria na mesma transação. Mudanças de papéis usam o mesmo bloqueio. Repositórios aceitam cliente transacional e reaproveitam a transação externa. Se a auditoria falhar, dados e versões são revertidos. A trilha registra autor, ação, registro e instante; eventos não aceitam alteração ou remoção pelo banco. Não registra corpos completos, credenciais ou segredos de sessão.

Contas têm versão otimista. A aplicação impede autodesativação, redução do próprio papel e remoção do último administrador ativo. Administração pode redefinir senhas; cada pessoa também pode trocar a sua, informando a atual. O banco restringe papéis e versões válidos, além das FKs.

## Consequências

- A migração preserva os cadastros existentes e inicia o sistema sem contas. É necessário executar a CLI antes do primeiro acesso. Não atribuímos alterações antigas a um autor fictício.
- Toda pessoa autenticada pode consultar os dados da organização. Exportações futuras de PDF/XLSX/CSV devem aplicar a mesma autorização, inclusive ao baixar arquivos gerados pelo worker.
- O bloqueio global simplifica consistência e revisão de permissões na instalação local. Otimizar essa serialização exige preservar a atomicidade e a ordem de bloqueios.
- **Tamanho mínimo da senha (atualização da E8).** O mínimo, antes de 15 caracteres, passou a 5 a pedido do usuário, para facilitar o uso diário pela secretaria. A interface é publicada só em `127.0.0.1` e o limite de tentativas acima continua valendo. Antes de liberar o acesso pela rede (E9), o mínimo deve ser revisto junto com HTTPS e a origem configurada. As senhas já cadastradas não mudam.
- A operação em rede exige HTTPS, origem configurada e proteção do banco/backups. Não há MFA, redefinição por e-mail, ACL por planejamento ou recuperação automática de administrador nesta etapa. Recuperação operacional será definida na E8, sem rota pública de reinicialização.
