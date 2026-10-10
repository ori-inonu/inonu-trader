# Proposta observacional DeFi

Estado: **rascunho com dependências**, sem SPEC congelada ou implementação iniciada. Objetivo: tornar a descoberta de produtos OKX DeFi utilizável como evidência de pesquisa no GEV, preservando identidade, unidades e desconhecidos. A pesquisa documental foi aprovada independentemente; isso não comprova acesso pessoal ou retorno.

## Base e direção delegada

Usar a [pesquisa aprovada](RESEARCH.md) e o [registro das fontes](SOURCES.json). Search e detail descrevem observações de produtos; exit descreve preparo de transação. Este rascunho limita-se à futura análise offline de observações de search/detail. Não usa endereço pessoal, autenticação, depósito, retirada, claim ou calldata.

O Jev recomendou revisão e especificação offline no recibo `eb45ce33-7a7b-47e1-87d4-8f130737157c`. No recibo `53b039b0-3af5-4a07-a59f-930cfeaed409`, recomendou `separate_observations` para rendimento e se absteve sobre formato de captura e ponto de entrega, por baixa confiança. O recibo `6697b02b-4166-480f-b9b8-2d65209447f1` selecionou consolidação do guia e deste rascunho. `approved_by=jev_delegated`, `human_response=false`; custo faturado desconhecido. Essas decisões orientam somente o trabalho técnico já autorizado.

## Comportamento proposto para especificação posterior

| Requisito proposto | Comportamento observável | Verificação a especificar |
| --- | --- | --- |
| D1: identidade | Associar produto, rede, protocolo e ativos quando o contrato fornecer estes campos. Identidade incompleta ou divergente fica explícita; não unir pelo nome do token. | Casos de redes/produtos divergentes, identidade ausente e tipos de ID inconsistentes na documentação. A regra exata de entrada ainda depende do formato escolhido. |
| D2: rendimento | Preservar search e detail separadamente, sem média, ranking ou projeção de carteira. Em search, rate é fração APY; em detail, APY só quando identificado explicitamente, senão unidade desconhecida. | Search 0.02140 corresponde a APY anunciado de 2.14%; detalhe sem identificação do tipo não recebe unidade presumida. Não inferir fórmula de composição. |
| D3: custos e liquidez | Exibir TVL search em USD como contexto. Taxa sem base, unidade/escopo incompletos e liquidez pessoal de resgate ficam desconhecidos. | feeRate ausente ou ambíguo não vira zero; TVL e suporte a resgate não promovem liquidez executável nem retorno líquido. A unidade de TVL detail não foi explicitada na fonte consultada. |
| D4: elegibilidade e atualidade | Separar indicadores do produto de acesso pessoal. Registrar eventual horário de captura declarado sem apresentá-lo como timestamp do provedor. | isInvestable/isSupportRedeem/isSupportClaim não comprovam elegibilidade da carteira. Ausência de timestamp/bloco/TTL do provedor permanece desconhecida. Regras de atualidade local ainda precisam ser definidas. |
| D5: fronteira offline | Processar somente entrada explicitamente fornecida, com contrato limitado, origem declarada não verificada e execução não qualificada. | A futura SPEC precisa definir campos permitidos, limites, arquivos/objetos aceitos, sanitização e comportamento de erro antes de TDD. Não reutilizar dados privados ou fontes descobertas automaticamente. |
| D6: efeitos e resultado | Não consultar conta, produzir transações ou calcular lucro pessoal. Não selecionar o produto de maior APY como recomendação. | Casos devem demonstrar ausência de rede, credenciais, assinatura e projeção de ganho na entrega escolhida. |

Os requisitos acima orientam uma futura SPEC e não são aceitação congelada. A documentação de `LENDING` e de resgate também pode envolver empréstimos/pagamentos; a categoria não determina ganho pessoal. APY pode variar e não demonstra rendimento efetivamente recebido. Indicadores de suporte a resgate não estabelecem prazo ou capacidade de retirada.

## Dependências que impedem implementação

1. **Formato de captura:** a consulta delegada se absteve entre captura limitada da resposta e representação normalizada. Investigar padrões locais e incompatibilidades do envelope documentado antes de nova decisão sustentada por evidência.
2. **Entrega:** a consulta delegada se absteve sobre relatório puro, CLI offline ou manutenção apenas da pesquisa. Definir a interface e o limite verificável depois dessa investigação.
3. **Contrato final:** decidir tipos, identidade, limites, origem, relógios, erros e campos exportados; congelar hashes e critérios com revisão independente. Só então iniciar TDD e implementação isolada.

Não há aprovação humana presumida nem necessidade de repetir a consulta sem evidência nova. Acesso pessoal, regras específicas de cada protocolo e liquidez real são fatos ainda desconhecidos, que uma escolha técnica não resolve. A investigação desses fatos exigirá recorte próprio; este rascunho não qualifica operações financeiras.
