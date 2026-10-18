# Delta de pesquisa — pagamentos e integração econômica

Data: 2026-10-11. Conversa: 01a12971-f941-7e42-8a42-fab6d44d4eb5. Pesquisa subordinada ao objetivo completo, que permanece ativo e incompleto. Não é implementação, aceite financeiro ou qualificação de estratégia.

## Baseline e evidência local

Main observado limpo em 14cbb7bd2878eed0a930b324b0c50610be7cdab8. O catálogo `web/src/lib/central/ecosystem-catalog.ts`, SHA256 249a08fa3577090a73856278a808b557f1c7293bc3da9f495f3f37a8bd4f51b5, já possui `payments-x402`, bloqueado/T2-A. Sua justificativa diz que os pagamentos não têm tetos descritos. Essa afirmação geral é contradita pela modalidade `upto` da documentação atual. A existência da linha no catálogo não demonstra integração executável.

## Matriz de diferenças confirmadas nesta retomada

| Recurso | Documentação observada | Estado no projeto | Decisão/limitação necessária |
| --- | --- | --- | --- |
| APP `charge` | Preço conhecido antes da assinatura e liquidação imediata | Representação genérica de pagamentos; não qualificado live | Separar pagamentos por serviços de ordens e swaps; custo de serviço entra no resultado líquido quando aplicável |
| APP `upto` | Consumo medido com teto conhecido na assinatura | Justificativa do catálogo generaliza ausência de tetos | Corrigir descrição por modalidade sem desbloquear execução; teto do pagamento não é limite de exposição de trading |
| APP `session` | Preço unitário conhecido; encerramento liquida consumo | Sem qualificação observada nesta revisão delimitada | Contabilizar consumo acumulado e autorização própria; não inferir orçamento global |
| APP `escrow` | Conceito de protocolo; item do menu de integração marcado Coming soon | Disponibilidade executável não demonstrada | Não tratar conceito e disponibilidade do serviço como equivalentes |
| Rede de pagamentos | Tabela atual: X Layer, chainIndex 196 | Catálogo restringe à X Layer | Cobertura específica desta família não pode ser extrapolada a toda Wallet/API |
| Tokens e gas de pagamentos | Tabela lista USDG, USDC e USD₮0; oferta de gas zero é temporária | Nenhuma qualificação de custo live feita aqui | Nunca transformar promoção temporária em custo zero fixo de uma estratégia |

Fontes primárias consultadas novamente em 2026-10-11:

- [Agent Payments Protocol](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/app), tabela de modalidades e menu de escrow.
- [Supported Networks](https://web3.okx.com/pt-br/onchainos/dev-docs/payments/supported-networks), tabelas de redes/tokens e condição temporária de gas.

Não foi efetuado pagamento, assinatura, aprovação, instalação de SDK, transmissão de credenciais ou chamada financeira. A recuperação da página OKX.AI nesta retomada retornou Internal Error; observações anteriores não foram convertidas em nova prova. É pendência de pesquisa separada, não motivo para impedir os dados de mercado.

## Aceitação proposta para correção futura do catálogo

1. A descrição distingue pagamentos com teto documentado de permissão para operações financeiras.
2. `payments-x402` permanece bloqueado enquanto não houver autorização e qualificação específicas; a pesquisa não o torna implemented/read_only.
3. Gas promocional e disponibilidade de escrow são condicionais, sem promessa de custo ou funcionamento.
4. Teste de contrato preserva estado, tier e ausência de caminho executor, além de verificar a descrição factual; revisão independente compara os textos às fontes.

Essa proposta ainda não está congelada. Prioridade elegível atual: fechar e revisar o contrato F1–F4 de proveniência, validade e cobertura antes de ampliar decisões do JEV. Alterações concorrentes na raiz permanecem intactas.
