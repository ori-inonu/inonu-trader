# Estado dos limites de consultas

Pedido: remover ou aumentar o teto das consultas usadas para decisoes do Jev. Revalidacao de 2026-10-18; nenhum limite financeiro, de risco, permissao ou provedor foi alterado.

| Escopo | Evidencia atual | Estado |
| --- | --- | --- |
| Consenso de engenharia do projeto | src/consensus/quota.ts em origin/main 2327a28 tem JEV_DAILY_CALLS=Infinity; teto por execucao so existe se informado explicitamente | sem teto diario por padrao, ja em main |
| Jev Engineering global | MCP ausente na lista de ferramentas; SKILL.md e scripts/decisions.ts ausentes no caminho ativo; existe backup historico | ajuste do teto separado de 20 tentativas nao aplicado |
| Pedir ao Inonu no desktop | src/desktop/handlers.ts define maxCallsPerDay=20, cooldown, timeout e tetos monetarios separados | preservado; nao confundir com consenso de engenharia |
| Agente de carteira | status do perfil vazio reporta configuracao de 144 consultas/dia e capacidade efetiva de 720 pelo ritmo automatico | preservado; nao foi executado nenhum ciclo |

O teste existente de quota executou reservas de 500 e 700 em ledger temporario, conferiu 1200 consultas contadas e refund para 1000. Saida real: 3 pass, 0 fail, 10 expect() calls, 255 ms. Nenhuma chamada paga foi necessaria. O mesmo arquivo de quota esta em main e no candidato.

O instalador global preparado em .scratch/jev-decision-limit-update.ts no checkout original parou antes de escrever por ausencia dos fontes esperados. Nenhum backup foi restaurado, nenhum arquivo global foi alterado nesta passagem e nenhum processo persistente foi reiniciado. O gateway existente nao comprova que fontes ausentes estejam carregadas nem que um limite tenha sido removido.

Nao se declara que todas as consultas do sistema estao ilimitadas. A remocao global continua pendente de uma instalacao ativa inspecionavel. A indisponibilidade nao impede testes locais ou o trabalho restante de alinhamento; as cinco inferencias reais do adaptador do projeto ja registradas sao distintas desse conector.
