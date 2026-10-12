Parecer independente — 2026-10-11: **nenhum novo bloqueador encontrado no delta LI2/LI3**. O fechamento anterior do P2 de linguagem de execução permanece preservado. Este parecer cobre a integração do ledger; não certifica conclusão global ou avanço de main.

Baseline informado: `714e2762ba3c1704cb00b5d8051bd0460c84ec66`; candidato informado: `16eb1edee343bb16039e53e83bd43d7e3b27f365`, pais informados `714e2762ba3c1704cb00b5d8051bd0460c84ec66` e `ff37327264d904242c57c21c8acb548a05651e82`. Sem `.git`, esses identificadores/ancestralidade não são certificáveis pelo export.

Conferência independente: 559 arquivos iguais às entradas do ZIP; contra o baseline, 556 arquivos preservados, dois modificados e um adicionado, nenhuma exclusão. Web, `package.json`, `bun.lock` e `tsconfig.verification.json` permanecem byteiguais.

| Critério | Evidência e limite |
|---|---|
| LI1 / C1 | Preservação de conteúdo demonstrada; refs, ancestralidade, worktrees e main limpa exigem verificação Git pelo integrador. |
| LI2 | `src/operator/ledger.ts:254–265`: validação antes da escrita e de cada rename; somente Windows/EPERM/EBUSY/EACCES, quatro tentativas, esperas 10/20/40 ms. Sem remoção do destino; erro persistente propagado. Probes confirmaram bytes binários anteriores até sucesso na quarta tentativa. |
| LI3 | `ledger.ts:244–259`: diretório/link reconhecido e erros de metadados bloqueiam, inclusive após espera. `src/operator/executor.ts:196–203` reavalia kill switch/prazo antes dos próximos envios. `executor.expiry.test.ts:84–133` e probes posteriores preservam aprovação/recibo/hash conhecidos e impedem handoffs subsequentes nos pontos exercitados, sem hash de perna não enviada. |
| LI4 / C4 | Logs do integrador conferidos: backend serial 1986 pass/2 skip/0 fail, 1988 testes/119 arquivos, exit 0; tipos combinados exit 0. Igualdade dos inputs permite reutilizar frontend 416/0 informado e build nativo 714, log/exit 0 conferidos. |
| LI5 / C5 | Revisão independente do delta concluída sem impedimento concreto. Integração permanece responsabilidade do integrador. |
| C2 / EC1–EC4 | Fontes da interface e contratos anteriores preservados; P2 fechado permanece fechado. Sem nova certificação funcional global. |
| C3 / C6 | Pendentes: nenhuma inspeção visual, navegador ou preview executado nesta revisão. |

Execução própria: Bun 1.3.14, `--no-env-file --no-install`; dois seams públicos existentes **45 pass/0 fail/336 assertions**, mais dez probes próprios **10 pass/0 fail/99 assertions**. Exercitaram APIs reais do export com arquivos/clientes sintéticos, revalidação, erros originais, espera padrão e expiração/kill switch nas persistências posteriores. Não reproduzem um bloqueio real de arquivo por outro processo Windows. Nenhuma suite completa foi reexecutada pelo revisor.

A primeira execução paralela do integrador permanece registrada: 1985 pass/2 skip/1 fail, `src/paper-supervisor-runner.test.ts:476`, `child_handshake_timeout;child_pid=26640;exit=running;stdout=;stderr=`. Caso isolado verde foi informado pelo integrador; serial verde foi conferido. Causa desconhecida; runner/teste byteinalterados. Os dois skips são conformance receipt-safety Market/Trader sem `RECEIPT_SAFETY_SOURCE`; não equivalem a cobertura executada.

Sem edições de produto/critérios, rede, instalações, credenciais, serviços ou operações financeiras. Escritas limitadas a relatório/probes/logs próprios neste reviewroot. Identidade observada: thread `01a12ad1-04ba-75d1-b5a3-937bfb6d3a1c`, session `01a12971-f91a-7b01-befa-dfa93eb04425`. Configurado GPT-6.1 Sol/xhigh; modelo/tier efetivos desconhecidos. Isolamento por cópia fornecida; sandbox de SO somente leitura não comprovado.

Hashes SHA256 conferidos:

| Artefato | SHA256 |
|---|---|
| `candidate.zip` | `44d53a4026d9965ee313c588dc5b93b539562393c867699ab2fa1ec84e54ab7b` |
| `candidate/src/operator/ledger.ts` | `3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab` |
| `candidate/src/operator/ledger.persistence.test.ts` | `4e4226969de5c462b6d49592816075069b9c8c4570d2e7c82b51a426aae4ff66` |
| `candidate/src/operator/executor.expiry.test.ts` | `3c49424fac0a66fde0f4f224b6dfbb9af2b2f64b8634165c573e1d4e51334f1b` |
| `CENTRAL-JEV-LEDGER-INTEGRATION-SPEC.md` | `8e4a0775bf0683306c710362dcb8f7edba760b737b96cebeb8651e8ee7023fdb` |
| `CENTRAL-JEV-ACCEPTANCE.md` | `20e1558da58ceae78332020f1e4f84277eacdb694748d28b9ea599dc30808054` |
| `CENTRAL-JEV-EXECUTION-COPY-SPEC.md` | `a3ee84663fba8307e6ed7a8cbd3d51119b4ea489894808cefb8af34fcd4c5ed3` |
| `REVIEW-SEAMS.log` | `d4011fef496afe0c1bee2b01531e126dfcf623d733beac04db1e67a04a8e221b` |
| `REVIEW-PROBES.test.ts` | `d120f9e779d8b86faeac4cbba683c635d0b4efe7d45a9cc856333b055e1ffca5` |
| `REVIEW-PROBES.log` | `c19eadc558b6686dad4ead2497e7afbcc88f5da35c085f0ea0f8977b0b315940` |
| `../combined-root-serial.log` | `c4a5342fabcc9c609a961c972aca2b8499a42938696940425a60079229a2e45e` |
| `../combined-types.log` | `f830dee8279913b62956a5c27a3f52f0fccc8cec9f052fd4cdc8dee6f25b9de2` |
| `../combined-root.log` (falha preservada) | `1ad9093b08dd8528829f7784f3f94260da290ccb3632a405d9ec724d6df9bcba` |
| `../copy-native-physical.log` | `44e584cdec2a191476462a46c60aaa27174d49be3c573bc276a91367bc9f4d9e` |
