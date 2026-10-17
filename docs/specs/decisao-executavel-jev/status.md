# Status

Fase atual: concluída no checkout, com smokes e gates aprovados. Não implantada no processo instalado.

Escopo: duas correções de perda de informação antes do JEV. Nenhuma operação financeira, ativação de live, mudança de risco, orçamento ou cadência.

Pré-requisitos: documentação de área e contratos de evidência consultados; não há alterações em `src/agent` ou `src/onchain-read` nos outros worktrees no momento da inspeção. O checkout atual contém alterações concorrentes, que devem ser preservadas.

## Evidências desta tarefa

- Replay offline de recusa de venda real: em `recusa + 1 ms`, `recentSaleRefusals` e `withoutRefusedSales` retiram `exit_all` e geram `venda_recusada_por_impacto`. Antes, o serializer omitia o motivo (5.614 bytes, exit 1); depois, preserva o código completo (5.649 bytes, exit 0). A posição é reconstruída para replay histórico, não uma afirmação sobre o estado atual.
- Replay offline da sonda com código de recusa observado no ledger: somente o candidato afetado fica em `skip`, com marca `gas_station_pendente`; o outro permanece inalterado quando a cotação é desconhecida. A recusa fica em cache por 60.000 ms e uma observação bem-sucedida após esse prazo reabre a oferta, preservando o filtro de perfis por impacto. Quatro invocações locais do callback, zero chamadas ao provedor. Não prova que a falha histórica posterior à execução era detectável pela sonda.
- Brief rico medido: 11.979 bytes UTF-8, teto 12.000, oito posições, sete compras e sete códigos por posição, com proveniência de timestamp presente. Margem de 21 bytes neste cenário de referência, não garantia universal.
- Revisões estáticas independentes concluídas: nenhum achado remanescente na fatia do Brief ou da sonda. O achado de causa incorreta no relatório foi corrigido e reavaliado. Gates finais aprovados abaixo.

## Observação real e limites

Na amostra 334 do observador somente leitura (`sampledAtMs: 1792174527075`), 211 de 977 métricas catalogadas estavam observadas e 766 permaneciam desconhecidas. Health e analysis estavam disponíveis; a coleta de 24 horas ainda não havia terminado. Retorno ajustado por fluxos externos e lucro líquido continuam indisponíveis por falta de conciliação e de PnL verificado. Não tratar variação bruta de saldo como lucro.

O modo automático já pode chegar a um minuto em condições específicas; a configuração manual não admite esse intervalo. Um ciclo por minuto durante 24 horas exige 1.440 consultas principais, antes de fechamentos ou chamadas adicionais, frente à capacidade local arrojada de 720 por dia. Não foi demonstrado conflito entre a fórmula de cadência e o pacing existente; não houve mudança de limites ou de ritmo.

O processo instalado não foi reiniciado ou atualizado. Checkout validado não equivale a implantação na carteira ativa. O observador de 24 horas continua sendo somente leitura e ainda não havia completado as 24 horas na amostra citada.

## Revisão e integração

A revisão da sonda encontrou uma perda adicional: `report.view` classificava a recusa de gas station como `abaixo_do_minimo` e podia descartar sua marca depois das quatro primeiras. A integração agora preserva o código explícito e sua marca, sem novo campo ou schema. O mesmo smoke do runner e da projeção real do radar mostrou antes `abaixo_do_minimo` com texto falso sobre ordem mínima; depois, `gas_station_pendente` com texto correto, quatro marcas, uma sonda, nenhuma consulta ao modelo e zero ordens. A revisão independente do hunk encerrou o achado.

A primeira execução de gates teve typecheck sem diagnósticos e avançou para `bun run test`, mas foi interrompida para concluir essa integração, portanto não conta como aprovação da suíte. A saída parcial registrou duas falhas de frescor (`reader.last()` nulo após retorno de Book gerenciado fresco e fixture com `nowMs` fora de escopo), além de uma nova asserção incidental de stance. As correções concorrentes de frescor já estavam presentes na leitura seguinte: foram preservadas, sem novos edits nessa área. Smoke do serviço com I/O controlado confirmou `quality: current`, `managedOk: true`, `watchFailed: 1`, `agentUsd: 36` e timestamps iguais em `atMs` e `observedAtMs`, com zero efeitos externos. O teste duplicado baseado em stance padrão foi removido, mantendo a cobertura comportamental de cotação desconhecida em entry-cost.

Durante a estabilização concorrente da T14, suítes intermediárias encontraram expectativas incidentais de idade de cache e de valor em dólares da posição, além de divergência no caso de identidade de `token-risk`. As leituras subsequentes já continham correções concorrentes, que não foram reescritas. O smoke puro do normalizador confirmou identidade correspondente aceita, chain ou token divergentes recusados e identidade ausente mantida como `null`; zero chamadas externas. A execução final integrada abaixo passou sobre o estado corrigido.

## Verificação final

Execução sequencial real, Bun 1.3.14, exit 0:

```text
bun run typecheck
$ tsc --noEmit -p tsconfig.verification.json

bun run test
7884 pass
2 skip
0 fail
984131 expect() calls
Ran 7886 tests across 480 files. [469.41s]

bun run test:lab
647 pass
0 fail
838136 expect() calls
Ran 647 tests across 16 files. [56.34s]
```

Nenhum arquivo de produção em `web/` foi alterado nesta tarefa; o consumo do novo código foi exercitado pela projeção de radar existente. Scripts próprios de smoke foram removidos após registrar os resultados. O observador somente leitura foi preservado.
