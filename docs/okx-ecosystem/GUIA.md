# Integrações OKX Wallet no GEV

Estado em 10/10/2026: o projeto dispõe de ferramentas locais para pesquisar tokens, sinais e cotações. A comparação Signals/Meme Pump foi integrada, testada e auditada. A pesquisa foi ampliada para segurança de saída, Rewards, produtos DeFi, contratos de patrimônio e Alpha Radar. O relatório observacional DeFi offline também foi integrado, testado e auditado. Acesso pessoal aos serviços, operação real e crescimento da carteira continuam sem comprovação neste trabalho.

| Frente | Capacidade disponível | Evidência necessária para avançar |
| --- | --- | --- |
| Meme Pump | Scanner de tokens por rede, protocolo e estágio; filtros de pesquisa e dados de pools. | Atualidade da segurança, profundidade vendável para a posição e custos de entrada/saída. O estágio do pump não prevê valorização. |
| Smart Money, Influencers e Whales | Relatório de compras históricas agregadas, com identidade e horários. | Histórico de saídas e resultados líquidos; uma compra observada não demonstra vantagem futura. |
| Signals + Meme Pump | Comparação offline por rede/contrato, com atualidade recalculada e dados ausentes explícitos. | Origem verificada, segurança atual, venda possível e cotação executável. Todas as linhas permanecem não qualificadas para execução. |
| Alpha Radar | Interface oficial para selecionar tokens e encontrar carteiras influentes; pesquisa documental, sem integração própria qualificada. | API/CLI específica, filtros tipados, identidade, unidades, relógios e acesso não foram estabelecidos nas quatro páginas consultadas. Não há equivalência demonstrada com Signals, Tracker ou Meme Pump. |
| DEX e arbitragem | Análise de cotações com barreiras de identidade, unidade, atualidade e custo. | Unidade de saída demonstrada e duas pernas comparáveis para a quantidade pretendida. A segunda perna autenticada continua bloqueada por unidade desconhecida. |
| Rewards e Cryptopedia | Pesquisa das regras públicas e dependências por campanha. | Campanha vigente, elegibilidade pessoal, benefício condicional e despesas completas. O exemplo consultado já encerrou; não representa ganho disponível. |
| Produtos DeFi | Pesquisa aprovada e relatório offline de busca/detalhe, com identidade, origem, idade da captura e unidades explícitas. Demo e importação de arquivos locais disponíveis. | Origem autenticada, unidades não documentadas do detalhe, custos completos, prazo e liquidez de resgate. APY e TVL anunciados não demonstram rendimento líquido pessoal. |
| Patrimônio e reinvestimento | Contratos públicos de saldos, histórico e posições DeFi pesquisados; contabilidade e supervisor paper existentes. | Unidades, cobertura, deduplicação, aportes/saques e custos verificados. Valuation, histórico parcial e rendimentos publicados não comprovam lucro realizado nem reconciliação da carteira real. |

## Experimentar a comparação local

Na raiz do projeto:

```powershell
bun --no-env-file run okx:evidence
```

A demonstração é sintética e preserva seus horários originais. Mostra três registros, com scanner desatualizado; não representa oportunidades atuais. O comando não faz consultas nem operações na carteira. Para comparar arquivos dos relatórios existentes, consulte o [guia de evidências](../okx-evidence-v1/GUIA.md), que define formato, limite e janela de atualidade.

O [guia Signals](../okx-signals-v1/GUIA.md) e o [guia do scanner](../okx-market-v1/OKX-WEB3-INTEGRATION.md) descrevem suas interfaces. Seus estados históricos devem ser lidos junto deste mapa: Signals e a comparação já foram entregues depois do guia inicial do scanner. Conexão Wallet no navegador, credenciais OnchainOS e acesso efetivo ao feed exigem evidências próprias. Nenhuma consulta autenticada foi realizada neste trabalho.

## Avaliar o que falta antes de considerar retorno

Para cada ativo, preservar rede/contrato, quantidade, unidade, origem e instante da observação. Liquidez de pool e TVL servem como contexto; a saída precisa de rota e capacidade para a posição pretendida. Segurança ausente, preço antigo, unidade desconhecida ou custos incompletos mantêm a avaliação pendente.

Separar preço e rendimento anunciados de estimativas, simulações e resultados reconciliados. O cálculo líquido precisa incluir despesas pertinentes de compra e venda, gas, aprovações, impostos do token, impacto, slippage, falhas e serviços, sem duplicar custos. Campo ausente permanece desconhecido. Juros compostos devem partir de patrimônio e ganhos líquidos reconciliados, incluindo perdas e movimentações. O relato de US$68 para US$6.700 não foi verificado e não fundamenta expectativa de retorno.

## Pesquisa e limites verificáveis

- [Unidades e contrato DEX](../okx-dex-units-v3/RESEARCH.md).
- [Segurança e possibilidade de saída](../okx-exit-security-v1/RESEARCH.md).
- [Rewards e regras por campanha](../okx-rewards-v1/RESEARCH.md).
- [Descoberta e resgate DeFi](../okx-defi-v1/RESEARCH.md), [guia do relatório offline](../okx-defi-v1/GUIA.md), [verificação](../okx-defi-v1/VERIFICACAO.md) e [auditoria](../okx-defi-v1/AUDITORIA.md).
- [Contratos de patrimônio e limites do retorno observado](../okx-portfolio-v1/RESEARCH.md).
- [Alpha Radar: interface oficial e lacunas do contrato](../okx-alpha-radar-v1/RESEARCH.md).
- [Verificação](../okx-evidence-v1/VERIFICACAO.md) e [auditoria](../okx-evidence-v1/AUDITORIA.md) da comparação entregue.

A comparação teve 101 testes pertinentes passando, 1151 asserções e typecheck estrito dos módulos afetados sem erros, além de duas revisões e auditoria independentes. Esses resultados verificam o software neste recorte; compatibilidade autenticada e rentabilidade real continuam desconhecidas. Na cópia candidata e nas revisões independentes, o recorte DeFi teve 20 testes pertinentes passando, 581 asserções e checagem estrita de tipos sem erros. A entrega teve duas revisões e auditoria final independentes. A demo e a ajuda funcionaram na raiz; o comando `bun --no-env-file run okx:defi` produz três observações sintéticas. O relatório preserva APY e indicadores separadamente; custos completos, saída executável e retorno líquido permanecem desconhecidos.
