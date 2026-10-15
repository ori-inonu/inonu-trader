# Evidência T2.1, T2.2, T2.5: cofre do Windows e provisionamento local (CFG-1, CFG-2, CFG-3, CFG-9, AC-CFG-1, AC-CFG-4)

Data: 2026-10-12. Estados de evidência: **configuração válida** (testes), **carregado em sessão nova** (fumaça do instalado, 20 de 20), **funcionando ao vivo** (leitura assinada real com a credencial vinda só do cofre). Nenhum valor de credencial foi impresso nem gravado nesta evidência; só aparecem contagens, nomes de variável e, para o identificador da chave OKX, os 4 últimos caracteres, que é a regra da tela de Configurações.

## Código

- `src/desktop/vault.ts`: serviço `InonuTrader` no Gerenciador de Credenciais; só os quatro nomes (`OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET`, `OKX_WEB3_API_PASSPHRASE`, `TYPESAFE_AI_API_KEY`); cache em memória para a interface síncrona do `SettingsStore`; escrita por **processo filho** do próprio exe (`InonuTrader.exe --vault set|delete|has NOME`), valor sempre por **stdin**, nunca por argumento de linha de comando; `secrets-meta.json` guarda só a data de atualização.
- `src/desktop/provision.ts` e `scripts/provision.ts`: lê `data/onchainos.env`, `data/jev.env` e `.env` (nessa ordem), guarda **apenas** os quatro nomes (o `.env` desta máquina também tem a chave privada do trader Kuru e `LIVE_ACK`, que o parser nem retém), relatório sem valores, `--dry-run`, `--force`, não altera nem apaga os arquivos de origem. Um valor que é só uma referência não expandida `${NOME}` é tratado como **inválido** (teste novo, primeiro falhando).
- `src/desktop/main.ts`: ramo `--vault` antes de criar casa de dados, log ou núcleo; `createStore` ligado ao cofre; `INONU_VAULT_SERVICE` só existe para testes e fumaça (serviço descartável, nunca o real).
- `src/desktop/handlers.ts` e `launcher.ts`: injeção do store e relógio corrigido por padrão.

## Testes

- `src/desktop/vault.test.ts` (13) e `src/desktop/provision.test.ts` (11): valor sentinela em todas as saídas, allowlist, relatório sem valores, falha de escrita isolada por nome.
- `src/desktop/` inteiro mais `scripts/build-desktop.test.ts`: 102 passam, 0 falham.
- Fumaça do instalado, `scripts/desktop-smoke.ts`: **20 de 20**. Novos itens desta rodada: com cofre vazio o app reporta credencial `absent` (e não lê `.env`); o exe instalado grava os quatro segredos pelo filho `--vault`; um início novo com o cofre cheio e sem `.env` reporta credencial `complete` (**AC-CFG-4**); o valor sentinela não aparece em arquivo da casa de dados, log nem relatório; as entradas descartáveis do cofre são removidas e confirmadas; desinstalação limpa.

## Provisionamento real nesta máquina (único usuário, sem reenvio)

```
vault: Windows Credential Manager, service "InonuTrader"

OKX_WEB3_API_KEY           imported      from data\onchainos.env  ends with 1a77
OKX_WEB3_API_SECRET        imported      from data\onchainos.env
OKX_WEB3_API_PASSPHRASE    imported      from data\onchainos.env
TYPESAFE_AI_API_KEY        invalid       (o .env tem um marcador ${...} de 19 caracteres, não uma chave)
```

`--dry-run` antes do real mostrou o problema da quarta linha: sem a regra do marcador o relatório teria dito "importado" e gravado o texto do marcador no cofre. **Pendência do usuário:** colar a chave real do modelo na tela de Configurações (ou corrigir o `.env`); só será usada na consulta autorizada T7.8. Os arquivos `.env` não foram alterados; apagá-los é a ação separada e confirmada T2.4.

## Prova ao vivo (somente leitura, quota mínima)

O exe compilado (`dist/desktop/app/InonuTrader.exe`), iniciado com casa de dados temporária, `--no-browser`, **sem `.env` e sem variável de ambiente de credencial**, lendo só o cofre:

```
/onchain/status        credential: complete
/onchain/chains        HTTP 200, ok: true, 54 redes
/onchain/hot-tokens?chainIndex=196   HTTP 200, ok: true, 50 tokens
/onchain/budget        free usado 1, basic usado 1 (teto 50000), premium 0
```

Isto é **funcionando ao vivo** para o caminho cofre -> gateway -> OKX assinado. Não é prova de instalação no sistema: o instalador só foi instalado em pasta temporária e desinstalado (nada fica instalado nesta máquina).

## Achado e correção durante a rodada

A linha de base completa (`bun run test`: 3481 passam, 8 falham, 2 ignorados, de 3491) acusou regressões das edições de relógio da rodada anterior; ver [T3.2-relogio.md](T3.2-relogio.md). Correção: bibliotecas e `scripts/onchainos-capture.ts` voltaram ao que estava no HEAD; o relógio corrigido é injetado nos pontos de entrada. Reexecução dos 15 arquivos que falharam ou tocam o assunto: **180 passam, 0 falham**. A nova execução completa está registrada em [CHECKPOINT.md](../CHECKPOINT.md).

## Pendências desta tarefa

- T2.3 (`providers.json` e tela) e T2.4 (remoção confirmada do texto puro, com backup restaurável) não foram feitas.
- A tela de Configurações do app instalado grava no cofre pelo filho `--vault`; foi coberta por teste de unidade e pela fumaça (escrita pelo exe), mas **não** foi exercida clicando na tela com o app instalado.
- O serviço `InonuTrader` do cofre desta máquina agora contém três entradas reais; remover com `InonuTrader.exe --vault delete NOME` se o usuário quiser desfazer.
