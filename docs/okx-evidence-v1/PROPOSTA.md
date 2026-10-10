# Reunir evidências de sinais e Meme Pump

## Objetivo autorizado

Ampliar a pesquisa local de oportunidades OKX no GEV, preservando identidade, riscos, liquidez e retorno líquido verificável. A entrega Signals foi integrada, testada e auditada nesta conversa. O objetivo amplo permanece ativo.

## Problema observado

Os relatórios de sinais e do scanner Meme Pump estão separados. Um sinal histórico de compra não demonstra preço atual, segurança ou possibilidade de saída. A pesquisa de seis fontes oficiais confirmou a entrada DEX em menor unidade, mas não declarou a unidade de `toTokenAmount`; a segunda perna autenticada continua bloqueada. Essa dependência não impede combinar observações existentes para pesquisa.

## Próximo ciclo proposto

Especificar e implementar uma união offline dos relatórios existentes por rede + contrato. Preservar proveniência individual, horários, estágio, avaliação do scanner e evidências pendentes. Duplicatas, identidade, dados vencidos ou fontes diferentes devem continuar visíveis; popularidade e coincidência entre fontes não elevam qualificação financeira. A entrada será limitada e validada; detalhes de formato e seam serão decididos na SPEC com o Jev e revisão independente.

Critérios a detalhar e congelar antes da implementação: identidade com caixa normalizada apenas em redes EVM explicitamente conhecidas; sem união por símbolo; nenhuma fonte sintética promove autenticada; atualidade recalculada com relógio e prazo explícitos; campos desconhecidos preservados; liquidez de pool não se transforma em saída executável; retorno líquido e execução continuam não qualificados; comando offline sem rede ou credenciais; TDD, typecheck e revisões independentes; somente arquivos próprios e integração mínima por hashes.

## Limites preservados

Sem autenticação, rede na união, ordens, assinatura, transferências, claims, pagamentos, commit/push ou publicação nesta etapa. Sem promessa de lucro, recomendação de operação, alocação automática, uso de credenciais ou alteração do executor. Preservar mudanças preexistentes e os critérios congelados da entrega anterior. A extensão Wallet conectada não comprova acesso às APIs. Não enfraquecer a barreira DEX.

## Evidência e decisão

- [Entrega Signals verificada](../okx-signals-v1/VERIFICACAO.md) e [auditoria independente](../okx-signals-v1/AUDITORIA.md).
- [Pesquisa DEX](../okx-dex-units-v3/RESEARCH.md) e [fontes](../okx-dex-units-v3/SOURCES.json).
- [Decisão Jev](DECISAO.json): `offline_evidence_join`, recibo `700226d7-e4b6-47aa-ae6e-9c492a4aa0e2`, confiança 0,88. `approved_by=jev_delegated`, `human_response=false`; custo observado desconhecido. Seleção técnica consultiva dentro da autorização existente.

Condição de conclusão: relatório local útil para comparação, testes e revisão aprovados, evidências atuais preservadas. Não constitui resultado financeiro nem conclusão do objetivo amplo.
