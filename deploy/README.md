# Inonu em um servidor persistente

Pacote candidato em revisao. Nao foi publicado nem testado em uma conta de nuvem. Estado e provas em `../docs/sdd/hospedagem-24h/`. O servidor roda Bun; Caddy faz HTTPS; Authelia exige senha e TOTP em todas as paginas e APIs. O processo do agente continua sem navegador aberto.

O build hospedado usa `NEXT_PUBLIC_API_URL=""` e `NEXT_PUBLIC_INONU_CLOUD=1`: chamadas relativas preservam a sessao do proprio site, e Configuracoes mostra somente presenca das credenciais provisionadas no host. A API marca GET /settings como readOnly e recusa gravacao mesmo se um cliente ignorar o aviso. Nenhuma chave vai em NEXT_PUBLIC. O cliente do desktop com URL absoluta continua omitindo cookies.

A pagina usa Content Security Policy com hashes dos scripts de inicializacao do HTML estatico confiavel; nao permite JavaScript inline arbitrario nem eval. Estilos inline continuam permitidos para a interface React. Conexoes do navegador ficam na propria origem e a pagina nao pode ser embutida em outro site. Testes do parser e das respostas passaram; a verificacao visual no Edge ficou bloqueada pelo navegador, sem alterar suas protecoes. Authelia usa sua propria pagina de login e exige qualificacao separada no host.

Um secret ausente permite abrir o app para preparar a conexao; um arquivo montado mas invalido faz a inicializacao falhar com `cloud_secret_invalid`, e uma falha de leitura com `cloud_secret_unreadable`. Nenhum valor e impresso. A API traduz a recusa deliberada de alteracao dos secrets/preferencias para HTTP 403, preservando as falhas de servidor reais como 500. Os testes exercitam PUT e DELETE autenticados e confirmam que os dados nao mudam. Os botoes de verificar formato/testar OnchainOS continuam disponiveis ao dono; o teste OnchainOS faz uma consulta ao provedor, sem autorizar pagamento ou negociacao.

## Preparacao uma vez, no servidor escolhido

1. Prover uma maquina Linux x86_64 com Docker Compose, disco persistente e um dominio. Apontar `trader.<dominio>` e `auth.<dominio>` para ela. Publicar apenas TCP 80 e 443; nao publicar 8080 ou 9091. Executar uma instancia por volume.
2. Prover os arquivos em `deploy/secrets/` pelo gerenciador de secrets do host. Nomes: `gateway_token`, `model_key`, `okx_key`, `okx_secret`, `okx_passphrase`, `auth_session`, `auth_storage`, `auth_jwt`, `authelia_users`, `smtp_password`. `gateway_token` e um segredo aleatorio de 48 a 128 caracteres base64url ou hex, montado somente no edge e no app, sem variavel de ambiente. Os tres segredos de Authelia devem ser aleatorios e independentes, com pelo menos 64 caracteres hex. O arquivo de usuarios segue `users.example.yml`, com o mesmo identificador de `INONU_OWNER`, email real e hash Argon2id. Gerar o hash privadamente no host com `authelia crypto hash generate argon2`; nao informar senha nesta conversa.
3. Copiar `.env.example` para `.env` no servidor e preencher dominio, identificador e integracao SMTP com TLS. A senha SMTP fica no secret, nunca no arquivo de codigo. Nenhum segredo do Windows e transferido por este pacote.
4. Renderizar as configuracoes, da raiz do projeto: `bun --no-env-file --env-file=deploy/.env deploy/render.ts`.
5. Verificar o pacote antes de subir: `docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet`; no host Linux, validar Authelia com `docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps auth authelia validate-config --config /config/configuration.yml`. Isso exige os arquivos renderizados, as variaveis SMTP e os mounts reais. Validar Caddy com a ferramenta oficial tambem. O ambiente desta entrega nao tem daemon Docker: o Compose passou verificacao de configuracao, mas Authelia real continua pendente. Nao usar dinheiro antes dessa qualificacao.
6. Depois da qualificacao do core e da escolha humana pendente sobre o runtime local, construir e subir no host: `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build`. Este comando nao foi executado nesta entrega.
7. Abrir `https://trader.<dominio>`, autenticar com senha, cadastrar o TOTP pessoal no portal e conectar a carteira. A entrada OKX e feita pelo usuario no link emitido pelo servidor. Depois disso, toda gestao e configuracao financeira e do agente, dentro das capacidades comprovadas da conta e do instrumento.

No primeiro login, o usuario deve conferir que o nome em `authelia_users` e exatamente `INONU_OWNER`, entrar pessoalmente com a senha cujo hash foi provisionado e escolher registrar TOTP. O codigo de verificacao deve chegar ao email configurado via SMTP; somente depois dessa verificacao deve ler o QR no seu autenticador e confirmar o codigo TOTP. Nenhuma senha, QR ou codigo deve ser enviado para esta conversa. Antes de conectar a conta OKX, testar em outra sessao do navegador que senha sozinha nao abre o trader e que senha mais TOTP do dono abre. Cadastro, recuperacao e entrega SMTP ainda precisam dessa prova real. A pagina pede novo login ao completar 1 hora ou 10 minutos de inatividade; isso limita o acesso visual, enquanto o processo do agente permanece no servidor.

Os limites independentes da OKX devem ser ligados antes de habilitar a execucao da conta no host. Sem eles, o processo hospedado continua em analise; hospedar ou fazer login na pagina nao liga swaps.

## Qualificacao antes de usar dinheiro

- Sem login, com apenas senha (sem TOTP), com outro usuario, com Host ou Origin estrangeiros e com cabecalhos forjados: a pagina e as APIs nao devem responder dados da carteira nem executar efeitos.
- Confirmar o login OKX **no servidor**. Nao copiar `session.json`, `machine-identity`, `keyring.enc` ou estado `connected` da maquina Windows. A sessao expira: medir sua validade e o comportamento de recuperacao real; o app nao pode prometer 24 horas sem essa prova.
- Instalar o programa Linux pelo fluxo verificado do app, com SHA256 fixado pelo dono do core. Preservar executabilidade do arquivo no volume. Suporte Linux ainda depende da entrega de Claude.
- Configurar os limites independentes da conta OKX antes de habilitar swaps na hospedagem. O wrapper hospedado relera `wallet status` imediatamente antes de cada cotacao e envio e recusara qualquer politica ilegivel, desligada ou fora dos tetos do app. Nunca usa `--force`.
- Revalidar parada aguardada, idempotencia e ordens incertas. Repetir um reinicio durante ordem sintetica; a ordem enviada nao pode ser duplicada. A reconciliacao automatica de ordens incertas ainda e responsabilidade do core.
- Comparar custos e resultado liquido com manter a carteira. Os testes com fakes nao comprovam uma operacao ou lucro real, nem suporte a alavancagem.

## Operacao do host

As imagens Bun 1.3.14, Caddy 2.11.7 e Authelia 4.39.28 estao fixadas por digest do indice de imagens. Em 2026-10-14, os manifestos do registro oficial foram lidos, o SHA256 dos bytes foi comparado ao header Docker-Content-Digest, e linux/amd64 constava dos tres indices. Isso evita mudanca silenciosa da tag; nao substitui construir/executar as imagens e qualificar seus servicos. Atualizacoes exigem nova revisao do digest e dos testes.

Dados, planos, ledger, orcamento e identidade OKX ficam no volume `app-data`. Manter a mesma identidade de maquina em reinicios do mesmo host; mudanca de maquina exige novo login. Fazer backup cifrado do volume e testar recuperacao offline. Nao publicar o volume ou seus arquivos em Git. Secrets e configuracoes geradas estao ignorados por `deploy/.gitignore`.

### Backup e recuperacao antes de producao

O host ainda nao foi escolhido, portanto nenhuma copia periodica foi configurada. A configuracao do host precisa incluir uma copia diaria cifrada fora do disco primario, retencao definida e alerta de falha; o destino e a chave de cifragem devem ser do dono. Copiar `app-data` inteiro (inclusive ledger, planos, estado e onchainos-home), `auth-data` inteiro (SQLite e arquivos WAL), dados/configuracao do Caddy e os secrets em cofre separado. Uma copia apenas de config.json nao protege ordens pendentes ou stops.

Para uma copia consistente sem um mecanismo de checkpoint ja qualificado, parar app e auth pelo Compose, confirmar que os processos encerraram, copiar os volumes preservando proprietario e permissoes e cifrar antes de qualquer envio para o destino de backup. A copia dos volumes parados e parte de um teste de recuperacao; a pausa interrompe vigilancia de novos stops e deve entrar no desenho de disponibilidade. Um snapshot online do provedor so substitui esse procedimento depois de testar a consistencia do journal e do SQLite. Nao declarar que existe backup sem sua execucao e teste de restauracao no host.

Restaurar primeiro em volumes novos, isolados e com portas privadas. Manter o host anterior desligado ou isolado da OKX para evitar duas instancias da mesma carteira, mesmo quando usam volumes distintos. Antes de iniciar a copia restaurada, criar `agent/STOP` com conteudo `STOP` no volume app-data para impedir novos envios. Conferir integridade do journal e dos planos, autenticacao do dono e identidade dos enderecos; consultar os recibos das referencias pendentes em leitura. Uma copia antiga pode nao conter transacoes enviadas depois dela: comparar o historico da conta desde o instante da copia e manter esses casos sem execucao enquanto faltar conciliacao conclusiva. Nao remover STOP nem reativar dinheiro so porque os arquivos abriram. Login da OKX numa maquina nova e pessoal, sem copiar o signer do computador para resolver o teste.

O teste deve demonstrar restauracao dos planos e das ordens pendentes, recusa de envio durante STOP, exclusao do host anterior e ausencia de duplicacao apos a recuperacao autorizada. O lock por PID no volume nao prova exclusao entre maquinas. Backup e restauracao real, especialmente continuidade sem pausa, ainda sao condicoes pendentes da hospedagem 24 h.

`restart: unless-stopped` recupera a queda do processo, mas nao remove limite/expiracao do provedor. O container pede cinco minutos para shutdown e o entry point espera `agent.close()`. A qualificacao desse contrato depende da revisao do core atual. Logout da pagina de Authelia nao desconecta a carteira: usar o comando de desconectar do app quando quiser parar a gestao. O servidor nao depende de uma pagina aberta.

O healthcheck autenticado interno verifica a resposta HTTP sem ler carteira ou chamar a OKX. Um container marcado como unhealthy precisa de supervisao do host: Docker Compose nao reinicia automaticamente um processo vivo so por esse estado. `HOME` fica no volume em `/var/lib/inonu/home`; o programa pode gravar cache ali apesar da raiz somente leitura. Certificados CA sao instalados explicitamente na imagem. Validar ambos no container real.

Para verificar o proxy sem Docker ou fundos, usar o binario oficial Caddy 2.11.7 conferido contra o digest do release: `bun --no-env-file deploy/verify-proxy.ts <caminho-absoluto-do-caddy> <pasta-privada-de-evidencia>`. O harness usa autenticador e app ficticios em loopback, grava REPORT.json e encerra seus processos. Dez verificacoes foram exercidas nesta entrega. Isso testa roteamento e headers reais do Caddy; TOTP, HTTPS publico e login OKX continuam exigindo qualificacao separada.

Para gerenciar fatores ja cadastrados, Authelia exige segundo fator mais codigo enviado por email. O primeiro cadastro continua dependendo do email do dono, que precisa estar protegido, e deve ser feito antes de expor fundos ao servidor. Testar esse bootstrap e a recuperacao no host. Um ataque de tentativas pode bloquear temporariamente o usuario; manter acesso administrativo ao host para parar o container ou criar `/var/lib/inonu/agent/STOP` com conteudo `STOP` pelo console do host. Esse caminho de parada deve ser testado sem depender do painel. O limite desligado ou ilegivel impede inclusive saidas de protecao: um stop nao e garantia de execucao e o sistema nao contorna revogacao do dono.

## Fontes

- [Caddy e forward_auth](https://caddyserver.com/docs/caddyfile/directives/forward_auth).
- [Authelia e Caddy](https://www.authelia.com/integration/proxies/caddy/).
- [Configuracao Authelia por secrets](https://www.authelia.com/configuration/methods/secrets/).
- [Elevacao de sessao Authelia](https://www.authelia.com/configuration/identity-validation/elevated-session/).
- [Caddy e secrets por arquivo](https://caddyserver.com/docs/caddyfile/concepts).

