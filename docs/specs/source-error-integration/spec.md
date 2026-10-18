# Spec: integrar SourceError com compatibilidade

Status: aprovada para implementacao no escopo de integracao solicitado pelo dono.
Base: main 98c5ab08fd37fb4fdf09c39eb1645b325a606fed.

## Contexto e resultado

A goal1 extrai SourceError para um modulo proprio, mas mistura a extracao com retirada de exports, reorganizacao documental, clientes autenticados e dependencias. Copiar os arquivos inteiros regrediria a API da main. Esta fatia recorta somente a classe e seus imports.

ask.ts continua exportando o mesmo construtor usado pelas fontes. Os consumidores existentes conservam instanceof, codigo constante e contagem das chamadas enviadas. O modulo novo nao tem imports ou efeitos de inicializacao.

## Aceitacao

- Preservar heranca, mensagem, code e onchainosCalls, incluindo o padrao null.
- Importar e reexportar a mesma classe em ask.ts; preservar todos os outros exports e constantes.
- Sete consumidores de producao importam a classe do modulo proprio. Os outros imports de ask.ts mantem os tipos e, no ranking, as constantes utilizadas.
- Preservar chamadas, retornos, autorizacao, limites, precos, journals e cadencia.
- Revisar o diff e passar os testes existentes de inonu, tipos, core e laboratorio.

## Gate

Jev tool review_source_error, recibo b441deaf-8742-422c-bbf2-b2da5b0fb901, confianca 0.5. A revisao adicional identificou a retirada do export legado e conferiu testes existentes de recusas e contagem. Decisao de design consultiva extract_compat, recibo b3d552a9-a768-4694-9950-ef1f32cdd043, confianca 0.96. Spec e plano preparados antes da implementacao e aprovados no escopo de integracao solicitado pelo dono. Nenhum recibo autoriza operacao real.

## Limites

Origem goal1 e merge antigo da raiz preservados. Ficam pendentes a reorganizacao documental, clientes autenticados, dependencias e operacoes reais. Esta fatia nao implementa consulta nova por tick, nao qualifica producao nem mede lucro.
