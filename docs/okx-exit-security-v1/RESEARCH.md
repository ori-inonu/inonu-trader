# Segurança e possibilidade de saída no ecossistema OKX

Pesquisa pública delimitada em 2026-10-10: duas buscas e três páginas canônicas, sem conta, carteira, autenticação ou transações. Fonte consultada não comprova acesso pessoal. A decisão técnica Jev bcda7bc8-8585-4d93-bdec-5adbb4fdabbd escolheu investigar este contrato; approved_by=jev_delegated, human_response=false.

## Simulação

A API depende de clientes habilitados. A página associa carteira, destino, rede, dados da transação e valor nativo à simulação; descreve mudanças de ativos, gas usado, motivo de falha e riscos. O valor nativo tem unidade mínima explícita; a unidade de rawValue não está explícita. Há divergências: cabeçalho GET e exemplo POST; descrição base58 e exemplo hexadecimal; intenção descrita Swap e exemplo SWAP. Nenhum campo de bloco, instante da simulação ou TTL aparece no contrato mostrado. Acesso desta conta e contrato HTTP definitivo continuam desconhecidos. Estas lacunas impedem implementar um adapter autenticado confiável agora. Lista vazia de riscos não demonstra segurança futura; gas usado não fornece sozinho o custo completo. Essa última conclusão é uma inferência sobre o contrato observado. [Simulação OKX](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-simulate-transaction).

## Indicadores de mercado

Advanced Info expõe classificações como honeypot e baixa liquidez, nível de risco e concentração de detentores. createTime se refere à criação do token, não ao instante de avaliação do risco. totalFee não tem unidade, período e escopo suficientes para representar o custo desta posição. Tags podem coexistir; Smart Money não anula indicação negativa. O contrato mostrado não fornece idade específica da análise de segurança nem venda executada. Inferência: esses campos ajudam a rejeitar candidatos ou pedir evidências adicionais, mas não comprovam saída segura para uma quantidade determinada. [Advanced Info OKX](https://web3.okx.com/onchainos/dev-docs/market/market-token-advanced-info).

## Cotação

amount usa unidade mínima. toTokenAmount é uma estimativa; sua unidade não está explicitada na descrição. fromToken.taxRate descreve imposto de venda e toToken.taxRate imposto de compra, em fração de 0 a 1. priceImpactPercent é assinado: 5 significa 5%; valor negativo representa diferença desfavorável pela fórmula documentada. A proteção padrão é 90%; 100 desativa o recurso. Quando o impacto não pode ser calculado, a API retorna null e desativa a proteção. tradeFee estima taxa de rede em USD; estimateGasFee usa unidade mínima da rede. Não se demonstrou custo total nem inclusão de todos os impostos nesses valores. Nenhum TTL aparece nos campos consultados. Inferência: retorno líquido continua desconhecido se faltam unidade de saída, impacto, custos completos ou resultado executado. [Cotação OKX](https://web3.okx.com/onchainos/dev-docs/trade/dex-get-quote).

## Próxima entrega elegível

Propor uma verificação local de evidências de saída que diferencie classificação, estimativa, simulação e resultado reconciliado. Identidade, quantidade, unidade, instante/bloco e proveniência precisam ser verificáveis; ausência permanece desconhecida. Não considerar null como zero, nem honeypot=false como garantia de venda. Reutilizar a contabilidade e o supervisor existentes. Implementação depende de SPEC e revisão independente; esta pesquisa não autoriza chamadas autenticadas ou operações financeiras.

## Limites

Documentação pública é mutável. Ausência de um campo nesta consulta não prova sua ausência em outras APIs. Não houve simulação live, compra, venda, medição de retorno ou confirmação de elegibilidade. Não há evidência para reproduzir US$68→US$6.700 ou garantir juros compostos.
