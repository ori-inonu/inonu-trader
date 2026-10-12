# UI truth — revisão independente do candidato

Baseline: `ff37327264d904242c57c21c8acb548a05651e82` (working tree, quatro arquivos rastreados modificados e um teste novo).

Revisor: `01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinto do implementador `01a12971-f941-7e42-8a42-fab6d44d4eb5`; sem autoria do candidato. GPT-6.1 Sol/xhigh solicitado; modelo/esforço/tier efetivos desconhecidos. Cópia exclusiva ordinária, sem sandbox OS read-only; nenhuma chamada de aplicação/provedor, operação financeira ou rede.

SHA256 conferidos novamente na origem e em `ui-truth-fixture-20261011/candidate/`:

| Arquivo | SHA256 |
|---|---|
| web/src/components/Rail/Rail.tsx | 7c4eaf349dc8515f091e6a6d40309e4dce3a9d65c373e83d88473758256fe6f5 |
| web/src/components/CommandCenter/CommandCenter.tsx | 15c02c343b5175297cb7661b85511ad449b82f1a548c6c1dccaed851a4d5d404 |
| web/src/app/layout.tsx | c24657fff755eb25d1cbc209d9800e2baccc5ff9a6e3a64c2d320b25e8158233 |
| web/src/lib/rail-render.test.tsx | 24fc5c4abdd2f069b4211386f9f3e5fd9e84fff098a619cb28746ba3038efef6 |
| web/src/lib/command-center-render.test.tsx | 80ebc7a776bb7c9fcc37f32ec25a11549f1f097ad91b036529e2d16844186f1c |

SPEC congelada: `585570519ecbd1d9a383ecf42d7465bacca709f33e13e136ef1fcff8461f4c30`.

## Standards

**Zero violações documentadas; zero smells materiais.** CONTRIBUTING:5/20 e instruções locais examinados; os 12 smells obrigatórios tratados como heurísticas, sem confundir checks de ferramentas com smells. Textos pertencem aos componentes existentes; nenhuma abstração/repetição comportamental injustificada. Rail-test:55–56 substitui somente a expectativa contraditória e acrescenta proibição explícita; demais contratos preservados. Diff sem CSS/backend/gates/permissões alterados.

## Spec

- **U1 PASS:** Rail:65; matriz pública Rail-test:21–35 preserva conexão/fonte/execução em cinco cenários.
- **U2 PASS:** CommandCenter:218/231 remove promessa por bloco e cadência inventada; bloco observado e estados individuais permanecem.
- **U3 fonte PASS; navegador informado:** layout:21 descreve monitoramento. Coordenador observou meta real corrigida, intro/cadência; nenhum DOM/recibo de navegador inspecionado independentemente aqui.
- **U4 PASS:** oito estados públicos em CommandCenter-test:7–24, incluindo fill real; mais 14 testes existentes de JevCore/order-state passam, 34 assertions ([recibo](ui-truth-fixture-20261011/candidate-preservation.result.json)). Fixtures sintéticas; sem atividade financeira.
- **U5 regressão PASS; evidência externa limitada:** via RTK local, baseline **5 pass/15 fail/66 assertions**; candidato **20 pass/0 fail/79 assertions**. [Recibos](ui-truth-fixture-20261011/candidate-focused.result.json) e [RED](ui-truth-fixture-20261011/baseline-red-focused.result.json). Coordenador informa frontend422/0, tsc0 e build60676 exit0 (Next16.3.4/webpack); streams externos não inspecionados.

**Veredito: PASS limitado à revisão independente do código fixado.** U3/U5 dependem parcialmente da evidência informada; desktop/mobile não exercitados visualmente aqui. Não certifico aceitação integral, integração em main16eb1ed/714e276 ou conclusão do objetivo JEV/Onchain OS.
