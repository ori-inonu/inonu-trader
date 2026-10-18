# Veracidade das descrições da central Jev

Conversa 01a12971-f91a-7b01-befa-dfa93eb04425. Baseline main 96d30cc387a6520aba23199e25d0d4ec71a7ad88; candidato remoto documental 2ed0324af1d539ea89e052b52309ec6365b4d2bb ainda não aplicado em main. C1–C6 e RI1–RI5 permanecem imutáveis.

Revisão independente B223F24C60AD6C979FED4C249904EE72AC5091BA055C8CE19D54E3834F4C0F23 identifica P2 preexistente: Rail:65, layout:21 e CommandCenter:231 prometem execução real ou ordem em cada bloco mesmo em dry-run, feed ausente ou hold. Conferido nos três arquivos reais do candidato. Não há regressão introduzida pelo merge documental; a alegação atual viola C2/C5 e a cobertura RI1/RI2.

- EC1: descrições estáticas da marca, metadados e central descrevem observação/decisão sem afirmar execução real ou colocação de ordens incondicional.
- EC2: badges existentes de simulação, execução não verificada e estados de ordens/fills permanecem derivados de sua evidência, inclusive rótulo legítimo de fill real observado.
- EC3: obter uma regressão renderizada que falhe no candidato atual para feed ausente, simulação, hold e descrição com fill real; corrigir os três textos e verificar frontend, tipos e build nativo.
- EC4: revisão independente da correção sem impedimentos antes de main; inputs backend inalterados permitem reutilizar logs backend com identidade verificada. Sem certificação visual C3/C6, ordens, push, deploy ou alterações concorrentes.

Decisão delegada: Jev evaluate_decisions Choice, recibo ef9218aa-4321-426c-abc2-1206bfa946c5, jev-1.13.0, escolha neutral, confiança .88, probabilidades neutral .91/conditional .09/abstain 0. Uso 594 entrada/54 saída; custo null, approved_by=jev_delegated, human_response=false. Estado mínimo sanitizado, sem envio de código ou mercado; recomendação não concede autoridade.

Arquivos exclusivos do integrador: web/src/components/Rail/Rail.tsx, web/src/components/CommandCenter/CommandCenter.tsx, web/src/app/layout.tsx, testes de render correspondentes e docs/REMOTE-BRANCH-INTEGRATION-20261011.md. Não alterar contratos financeiros nem visual/motion para resolver um defeito de descrição. Recusas de navegador e execução da prévia persistem, sem repetição/contorno.