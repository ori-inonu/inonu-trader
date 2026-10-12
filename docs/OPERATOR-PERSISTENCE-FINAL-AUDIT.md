Auditoria final independente — persistência

Autor: reviewer/thread `01a12ada-7b55-7fd2-8a20-c940f474c1a1`, distinto do implementador `codex-inonu-system-one-safety`/`01a12971-f941-7e42-8a42-fab6d44d4eb5` e do reviewer standards `01a12ada-91d7-7ce0-b6ea-e1556d234224`; não implementei o candidato. Baseline fornecido: `dd1ae31`; cópia ordinária exclusiva sem Git, sem RO imposto pelo SO. Sol/xhigh solicitado; modelo/effort/tier efetivos desconhecidos.

**Parecer: PASS para commit local exclusivamente dos três fontes abaixo.** Nenhum finding concreto ou ampliação de escopo identificado. Critérios congelados preservados.

- **P1 PASS:** `ledger.ts:237–265` mantém API síncrona, temporário completo no mesmo diretório e quatro tentativas Windows somente EPERM/EBUSY/EACCES; esperas 10/20/40 ms. Outros casos falham imediatamente.
- **P2 PASS:** `ledger.ts:254–265` reutiliza o temporário e publica por rename; não remove/trunca destino. Recuperação e exaustão preservam os bytes previstos; sem falso sucesso.
- **P3 PASS:** `ledger.ts:244–259` valida destino inicialmente e antes de cada tentativa; diretório/link reconhecido rejeitado, apenas ENOENT tolerado. Testes públicos cobrem metadados e mudança durante espera.
- **P4 PASS:** evidência real Windows previamente inspecionada: worker externo com FileShare.Read/Dispose, oito recuperações e dois controles tardios; seis execuções observam rename nativo, duas usam persister sem opções. Espera/plataforma/lstat padrões preservados. `persistence-production-probe.mjs:94–105` e manifesto/raw logs sustentam cobertura; affected confirma storagefailure, STOP, expiry, identidade e reconciliação.
- **P5 PASS (pré-commit):** li ambos os pareceres finais e confirmei vinculação aos mesmos hashes. A pendência standards do parecer SPEC e a pendência SPEC do parecer standards estão resolvidas por esta leitura, sem editar históricos. Recibos/streams relidos: `persistence-standards-clean-affected.*` 116/0/1083 asserts; `persistence-full-root.*` 1922 pass/2 skip/0 fail; `persistence-verification-tsconfig.*` tsc configurado exit0, streams vazios. Full precede apenas remoção de comentários; affected cobre os bytes finais. Não houve reexecução.

SHA256 confirmados:

- `src/operator/ledger.ts`: 3f56974ea89b86bbf0bea90061d0797463fc5deb1062f772d8cee9f536ee02ab
- `src/operator/ledger.persistence.test.ts`: 7dfa66eeb734d2401d1fdac61131908246d2ad1d472dbbbd7b0992c73c7c659e
- `src/operator/executor.expiry.test.ts`: 3c49424fac0a66fde0f4f224b6dfbb9af2b2f64b8634165c573e1d4e51334f1b
- `docs/OPERATOR-PERSISTENCE-SPEC.md`: 1aa0ea1667e8e1f46a82c1636cb0824df6b265fb16eb9d9e4ad3bbf5e7bf869a
- [SPEC final](persistence-final-verification.md): 9a7fa4d9983b8e077eca67ad536236798d13c1740e35cf23956628e71abec736
- [Standards final](../inonu-system-one-review-standards-20261011/persistence-final-review.md): 6cc846274d8ff9a06fed30cd1d11bd4c56c8859bc9acafc26a075c738b284327

- [Probe real](C:/Users/gabri/.codex/worktrees/inonu-operator-c4-research-20261011/persistence-production-probe.md): 35a6259b7db7a9bd9ecc1eef0adbdcb759960ed5715aa5a8ef36bdf47cbc95e6

Limitações: fixture finita; tentativas internas das duas execuções sem opções não observadas; anomalia temporal UTC preservada. 70 ms são esperas programadas, não deadline. Causa do EPERM histórico desconhecida; dois skips receipt-safety permanecem. Gates aplicáveis de integração/main ainda obrigatórios e pendentes: main não qualificada. Sem conclusão integral, merge/push ou autoridade financeira. Somente este relatório foi escrito; fontes, SPEC, evidências e históricos preservados.
