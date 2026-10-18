# C4 — pesquisa independente, proposta não aprovada

Objetivo completo OKX/JEV preservado; C4 prepara o próximo ciclo, sem liberar live/main. Autorização: somente este relatório; nenhuma implementação, segredo, .env, API ou negociação. GPT‑6.1 Sol/xhigh desejado; modelo/effort efetivos desconhecidos (variáveis observáveis ausentes).

Conversa: 01a12adc-473d-7381-b067-c83af7ccda31. Baseline informada: 4fe00c9; não confirmada: cópia comum sem Git (`fatal: not a git repository (or any of the parent directories): .git`). Recibo informado 7a6f080c-9808-49b9-840f-35266036d15c é conselho, não autorização.

Contrato literal: [R8.md:120](R8.md) — “recusar chave e endereço iguais aos do Kuru; `--no-env-file` com arquivo explícito; valor vazio de OPERATOR_LIVE_ACK igual a ausente.”

Fatos atuais:
- [operator-config.ts:117](operator-config.ts) valida formato da chave; :119 apenas lê endereço; :125–126 rejeita ack vazio; :177–183 não compara identidades.
- [okx-operator.ts:2](okx-operator.ts) importa singleton Kuru; [trader-config.ts:14](trader-config.ts) valida MODEL/PRIVATE_KEY/DRY_RUN e :71 executa no import. CLI :125 usa ambiente implícito; :118 não oferece caminho de config; [package.json:43](package.json) omite no-env-file.
- CLI :191–197 preserva sintético sem executor; :187 condiciona signer aos gates/ledger.

Aceitação proposta, a congelar antes de implementar:
1. Rejeitar chave equivalente e endereço EVM equivalente ao Kuru antes de construir clientes/signer ou persistir estado, sem expor valores. Comparar bytes/identidades derivadas localmente; caixa/checksum não distinguem carteiras. Identidade Kuru desconhecida bloqueia execução live; dryrun/shadow continuam disponíveis com execução fechada.
2. Rota documentada desabilita dotenv implícito no processo externo e interno, usa somente arquivo dedicado explicitamente escolhido e precedência definida. Arquivo ausente/ilegível ou seleção ambígua falha sem fallback. Ambiente herdado não prova origem; flag interna não desfaz herança (inferência, runtime não exercitado).
3. Ack ausente ou `""` resulta false; somente literal exato abre esse gate. Proposta adicional: whitespace-only equivale a ausente; ack preenchido errado ou literal com espaços permanece inválido. Preservar quatro gates cumulativos.

Bordas: chave zero/escalar inválido; endereço malformado; OPERATOR_ADDRESS diferente da chave; Kuru conhecido apenas por endereço; caminho relativo/CWD diferente; ambiente pai contaminado; config sintética com gates abertos.

Seams públicos existentes: loadOperatorConfig(source, repoRoot), operatorLiveGate(config, modelName). CLI main privado e autoexecutado (:115/:245): propor runCli(argv, io), env/FS/fábricas injetados e entrada protegida. Testes não copiados; R8:147/158 relata ausência de cobertura CLI e gates individuais sobreviventes, sem reprodução aqui.

TDD independente: fixtures falsas, canário temporário, subprocesso da rota real, controles negativos retirando cada proteção; zero chamadas/envios, estados temporários e logs sem chaves; registrar RED/GREEN e revisão distinta. Nenhum teste executado nesta pesquisa.

Dependências/alternativas: definir referência pública autoritativa Kuru e precedência. Derivar identidades de fontes locais explícitas ou usar endereço Kuru separado; segunda alternativa evita carregar sua chave, mas exige vínculo confiável. Propostos config/CLI/testes dedicados; package.json compartilhado pertence ao integrador. Revalidar hashes após concorrência; C1–C3/C5–C9 permanecem gates próprios.

SHA‑256 das fontes, bytes da cópia:

| Fonte | Hash |
|---|---|
| operator-config.ts | 1488d245dd30e449c8bdef7472651037ab3b68fd469ddde2f854362a2c4bc3e7 |
| trader-config.ts | 8383abb4a2e6a3bf913dcd12b809c1ad5ad2e5e765b97de78f2aba09242154d5 |
| okx-operator.ts | b7ccf4b784d87df3306e04da79eaae648f8db06abf60843d4e04322fd00103ef |
| package.json | f7a286c07e9d96524cb26f34622af02378c9cc67af501770b4a1c1be789e8091 |
| R8.md | 1b128ed5f136d4bd5d0b94f5fbf6ae61cfcdd582f0c86ed175d245df0b45de9f |
