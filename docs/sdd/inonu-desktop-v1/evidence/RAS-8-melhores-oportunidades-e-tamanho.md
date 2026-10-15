# RAS-8: as melhores oportunidades do ecossistema, com o tamanho de cada compra pelo saldo (2026-10-13)

Parte do [SPEC](../SPEC.md) (RAS-6, RAS-7, ASK-14, INF-1). Continua [RAS-7](RAS-7-motor-de-oportunidades.md). Tarefa: T8.7 em [TASKS.md](../TASKS.md). Pedido do usuário: o Radar e o Rastreador devem mostrar **somente as melhores oportunidades do ecossistema**, dizer por que o primeiro é o primeiro, e o Jev System One deve recomendar até a quantidade e o gerenciamento de portfólio com base no saldo atual.

## Regra de ouro mantida: o código descreve, o Jev decide

O código lê, mede e limita. O modelo (Jev) só responde **escolhas fechadas** sobre candidatos que o código montou; o código confere a resposta contra as opções oferecidas. O modelo nunca escreve número, valor nem endereço, e só **percentuais** do saldo chegam a ele: os dólares e o endereço da carteira ficam na máquina.

## Requisitos e atendimento

| ID | Requisito | Onde |
| --- | --- | --- |
| JEV-1 | Quando a pessoa clica em "Pedir as melhores oportunidades", o núcleo lê, em até quatro redes, os tokens em alta e os que carteiras rastreadas compraram, mede **seis famílias de evidência** (carteiras rastreadas, fluxo, liquidez, distribuição da oferta, tração, segurança) e **marcas de cuidado**; só entra token com pool de pelo menos US$ 20 mil, 100 detentores e duas famílias a favor; honeypot sai antes. | `src/opportunity/ecosystem.ts`, `src/inonu/source-ecosystem.ts` |
| JEV-2 | O modelo escolhe, por candidato, uma postura entre as oferecidas (pular ou um de três tamanhos), a família que mais pesou e a ordem dos até três escolhidos; resposta fora das opções é recusada com motivo. | `ecosystem.ts` (`validateEcosystem`), `src/inonu/jev-model.ts` (`ecosystemQuestions`) |
| JEV-3 | O tamanho em dólares é calculado **pelo código**: o menor entre o caixa em moeda estável da rede (depois de uma reserva de 20% da carteira, no máximo 80% por rede), o risco que a pessoa aceita perder por operação (padrão 1% da carteira, com perda assumida de metade, ou todo o valor se há marca de cuidado, menos o que já tem do token), 1% da liquidez do pool e 2% do volume de 24 h; o modelo escolhe um terço, dois terços ou o teto; abaixo de US$ 10 não há compra. | `src/opportunity/sizing.ts` |
| JEV-4 | O saldo é lido no clique (de graça, só leitura, pelo gateway) e vai ao núcleo como um esquema fechado; saldo com mais de 120 s é recusado antes do modelo. Sem saldo, os tokens vêm sem valor em dólar e a tela diz por quê. | `web/src/lib/opportunity/{saldo,balance,useBalanceReader}.ts`, `ask.ts` (`saldo_vencido`) |
| JEV-5 | Cada cartão mostra o token e a rede, o tamanho e os dólares, a parcela da carteira, de onde vem o teto, **qual família pesou mais e a medição de cada família a favor**, as marcas de cuidado e quantos candidatos chegaram e quantos o código deixou de fora. Resposta antiga (mais de 15 min) é marcada. | `web/src/lib/opportunity/picks.ts`, `web/src/components/Desk/Dock/JevPicks.tsx` |
| JEV-6 | O último resultado é guardado só para a aba, para não perder uma resposta paga ao trocar de aba, e só é relido se for exatamente o formato fechado. | `web/src/lib/opportunity/last-picks.ts` |

"Preparar compra" só **preenche o ticket** (com o tamanho sugerido); quem envia é o painel de [WAL-10](WAL-10-ordens-pela-carteira.md), com as travas do usuário.

## O que a medição diz (honestidade, mantida de RAS-7)

Os limites de tamanho são **escolhas conservadoras do código, não calibradas**. O backtest do histórico de preços **não achou vantagem firme** (barato contra o próprio histórico saiu pior que a média): a ordem do quadro de pares da OKX é "onde olhar", nunca retorno. A ordem das melhores oportunidades vem do **modelo escolhendo entre famílias medidas**, e o ganho dessa escolha é o que o Placar mede para frente; não há ganho afirmado.

## Evidência

- Núcleo: `src/opportunity/{sizing,ecosystem}.test.ts`, `src/inonu/{source-ecosystem,ask-ecosystem}.test.ts` (fonte, modo do pedido e modelo falsos; o modelo real nunca foi chamado por esta frente). Web: `web/src/lib/opportunity/*.test.ts*` (o formato da resposta é o JSON real que o núcleo produz).
- Tela conferida no navegador embutido com um resultado de teste numa origem à parte (apagado depois): três cartões, tamanho, família que pesou, marcas, rodapé de exclusões, chip de idade.
- A vista "Melhores" é a primeira do Radar e ocupa a zona do radar da aba Inonu; o quadro de pares da OKX foi para a vista "Pares OKX" do Radar.
- **Convivência:** outra conversa (Codex, `docs/sdd/carteira-evidencia/RADAR-SPEC-20261013.md`) está mudando em paralelo `picks.ts`, `JevPicks.tsx` e o núcleo da decisão para **preservar posturas "acompanhar"**. Esta entrega não mexeu nesses arquivos depois que essa frente começou, e a suíte inteira passa com as duas mudanças juntas.
