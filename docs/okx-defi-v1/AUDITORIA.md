# Escopo da auditoria DeFi offline

O objetivo desta entrega é tornar observações de produtos DeFi utilizáveis na análise OKX/Web3 do GEV, com identidade e limites explícitos. O resultado financeiro pretendido pelo usuário permanece sem demonstração nesta etapa.

## Contrato e revisão

Os critérios D1-D8 da [SPEC](SPEC.md) foram congelados antes da implementação. A pesquisa usa documentação pública oficial de busca e detalhe. A APY da busca é uma fração decimal; a unidade numérica do rendimento e do TVL do detalhe permanece desconhecida. Fee observada não equivale a custo completo, e as capacidades do produto não comprovam acesso pessoal.

Os revisores independentes `01a125a9-632d-7c62-b920-da886d69a180` e `01a125a9-e7ba-79e2-940d-324d4d0fcc41` aprovaram o candidato fixo, sem achados. O manifesto possui SHA256 `1b396810196f80af28a84d43f69d6927e955c745e472886c231bc419803df220`. Uma terceira revisão verifica os gates, a integração e a cobertura final; a conclusão independente deve ser lida no [parecer final](../../data/agent-evidence/01a1221e/okx-defi-v1/DEFI-AUDIT-V3.md). Este texto registra o escopo e as evidências, sem substituir o parecer.

## Preservação

A baseline contém 272 arquivos. Os 270 que não são pontos compartilhados são comparados com o estado imediatamente anterior à integração. Os 11 caminhos da entrega são comparados com os bytes aprovados. O helper usa handles exclusivos para `package.json` e `README.md`, verifica ambos antes de escrever e confere os bytes pelo mesmo handle. Novos destinos são criados sem sobrescrever arquivos existentes.

O probe isolado real de exclusividade de handles, leitura, escrita, truncamento e criação exclusiva foi aprovado. A integração completa é registrada separadamente; o probe não substitui sua evidência. O helper foi revisado independentemente. Não houve alteração de política de execução ou trust do Desktop.

## Limites das conclusões

Captura local recente não autentica o provedor nem fornece TTL. TVL não prova liquidez para vender ou resgatar uma posição. Os campos `netReturn`, `executableExit` e `totalCosts` permanecem null, `personalEligibility` permanece unknown e execução permanece `not_qualified`. A CLI não calcula ranking, recomendação de compra/venda ou reinvestimento.

As decisões técnicas delegadas ao Jev possuem recibos reais, `human_response=false` e custo faturado desconhecido null. Elas não concedem autorização financeira. Modelo, tier e sandbox efetivos dos agentes não foram certificados.

Os oito ciclos RED/GREEN preservam evidência de falhas comportamentais e posterior aprovação; wrappers originais indisponíveis são uma limitação expressa. A [verificação](VERIFICACAO.md) resume os 20 testes e strict. As evidências exatas estão no [manifesto de entrega](../../data/agent-evidence/01a1221e/okx-defi-v1/defi-delivery-manifest-v1.json).

