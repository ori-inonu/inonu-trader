# Hospedagem do Inonu por 24 horas

Escopo da sessao Codex `01a13ad7-7692-7280-9498-f3bae8718a93`, combinado com Claude na secao 11 de `../carteira-evidencia/COORDENACAO-CLAUDE-20261013.md`. Preparar e verificar o candidato local antes de escolher o provedor. Nao houve publicacao, login, copia de sessao OKX ou ordem desta sessao.

## Contrato

1. Processo Bun persistente, volume de dados duravel, uma instancia por volume. A ausencia de navegador nao encerra o agente.
2. Todas as paginas, arquivos e APIs passam por HTTPS e senha mais TOTP. Authelia verifica dois fatores, Caddy protege todas as rotas. O servidor do app exige tambem identidade do dono e segredo entre os servicos.
3. Host e Origin publicos exatos, sem confiar em cabecalhos fornecidos pelo navegador. Escritas preservam `x-inonu-intent: user`. Uma origem estrangeira nunca e reescrita para uma origem confiavel.
4. Credenciais OKX/modelo em secrets montados pelo provedor. Nada do cofre Windows ou da sessao OKX local e copiado. Escrita de credenciais pela API hospedada e recusada.
5. A sessao OKX e estabelecida no servidor por login humano na pagina da OKX. Sua validade e uma dependencia real; reiniciar o container nao deve apagar os arquivos de identidade dessa maquina.
6. A politica do dono e obrigatoria na hospedagem: limites positivos de transacao e dia, guarda de transferencias, dentro dos tetos documentados do app. Conferencia novamente imediatamente antes de cada comando de swap. Nao alterar a politica nem usar `--force`.
7. Parada de processo espera trabalho em voo antes de liberar o lock. Sem esse contrato no core, nao qualificar operacao hospedada.
8. Mesmas decisoes Jev do produto. Nao acrescentar regra de compra/venda nem alterar cadencia por este pacote. Nenhuma garantia de retorno ou operacao real por testes sinteticos.

## Aceitacao

| ID | Prova |
| --- | --- |
| H01 | Sem segredo do gateway ou sem dono autenticado: nenhum handler e chamado |
| H02 | Host/origem estrangeiros e escrita sem origem ou intent: rejeitados |
| H03 | GET same origin e escrita valida chegam ao handler local com corpo preservado |
| H04 | Secrets ausentes/invalidos nao aparecem em status/erro; API nao os grava |
| H05 | Politica ausente, desligada, frouxa ou ilegivel: nenhum swap e enviado; a leitura/login seguem disponiveis |
| H06 | Politica muda entre cotacao e envio: envio recusado |
| H07 | HTML e todas as APIs protegidos; nenhum publish de porta do app/Authelia/Redis |
| H08 | Fechar navegador nao encerra runtime; shutdown espera ciclo em voo |
| H09 | Build estatico sem URL localhost; mesmo contrato de API do agente |
| H10 | Validacao real de Compose/Caddy/Authelia, login TOTP e OKX no servidor escolhido |

H10 depende de Docker/provedor/dominio e atos de autenticacao humanos. Testes locais nao a substituem. A implementacao do agente e a UI continuam com Claude; o candidato de nuvem usa arquivos novos em `src/server/` e `deploy/`.

## Referencias oficiais conferidas em 2026-10-14

- [Caddy forward_auth](https://caddyserver.com/docs/caddyfile/directives/forward_auth).
- [Integracao Authelia com Caddy](https://www.authelia.com/integration/proxies/caddy/).
- [Cookies e sessao Authelia](https://www.authelia.com/configuration/session/introduction/).
- [SQLite Authelia](https://www.authelia.com/configuration/storage/sqlite/).

