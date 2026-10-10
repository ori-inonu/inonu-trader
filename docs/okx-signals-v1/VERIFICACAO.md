# Verificação dos sinais OKX

Verificado em 2026-10-10. A integração local corresponde exatamente aos 12 caminhos aprovados: cinco arquivos em `src/okx-signals`, dois em `scripts`, SPEC, GUIA, BASELINE e alterações mínimas em `package.json` e `README.md`. Os outros 74 arquivos da baseline protegida, incluindo `web/package.json`, conservaram seus hashes. Artefatos temporários e dados gerados pelos testes permaneceram fora da integração.

## Execução observada

- No projeto integrado: 82 testes passaram, zero falhas, 876 asserções; incluem 16 testes novos e 66 existentes de OKX.
- TypeScript estrito: `bun --no-env-file node_modules/typescript/bin/tsc --noEmit -p tsconfig.verification.json`, saída 0.
- `bun --no-env-file run okx:signals`: saída 0, três observações sintéticas, `execution=not_qualified`. SHA256 do JSON: `cc5609a634ec548b07e62ad14af378f07b78fd3c8ac384f633500e864837262b`.
- Em cópia isolada sem `.env`: suíte backend completa com 235 testes, zero falhas, 2.843 asserções. A suíte completa não foi executada no projeto principal, pois testes existentes escrevem arquivos de execução e iniciam subprocessos.
- A verificação final do projeto recebeu somente `SystemRoot` e `PATH` como ambiente herdado; o Bun foi executado com `--no-env-file`.

## Revisões independentes

Um revisor conferiu a SPEC e executou os 82 testes, o TypeScript, duas execuções offline idênticas e 36 vetores independentes de Base58. Outro revisor conferiu os padrões e executou os 16 testes novos e o TypeScript. Ambos usaram cópias isoladas, sem implementar esta entrega nem alterar os critérios. Nenhum achado permaneceu. A identidade Solana exige 32 bytes; a concentração acima de 100%, mesmo em decimal muito pequeno, é rejeitada; capitalização fora da lista congelada foi removida.

Hashes dos relatórios privados preservados nesta tarefa:

- SPEC: `0da588eac94226d781c29759019a5fd009ec5b2c1b0b10a60f0f866a8c49c7d0`.
- Padrões: `3c3af6b5fefebf86cce44b3a4e654fc592f0cbd99bbdc6ba7c27266e3d945495`.
- SPEC congelada: `b24bbe99a962220fe3fffd93d705fc441576d9100478bea001836594e287f70f`.
- Normalizador revisado: `910793b9fa3c654a6635b87ee427918d71c0fd29d40f00d47fc577a1db186b97`.

| Critério | Evidência verificável |
| --- | --- |
| S1 | CLI offline determinística, testes de subprocesso e JSON sintético observado. |
| S2 | Testes com transporte injetado para destinos, métodos, assinatura, corpo e validação anterior à rede. |
| S3 | Testes de cobertura, identidade, filtro e limite; revisão adicional de 36 vetores Base58. |
| S4 | Lista exata de campos, decimais preservados, valores desconhecidos e limite de concentração testados. |
| S5 | Horário Unix ms, categorias e classificação temporal testados; limites de liquidez descritos no guia. |
| S6 | Observações históricas sem qualificação de execução; evidências pendentes e acesso/custo desconhecidos explícitos. |
| S7 | Prazo compartilhado de resposta/corpo, redirecionamento recusado, erros sanitizados e ausência de retries testados. |
| S8 | Guia em português, fontes, duas revisões independentes, testes e hashes da integração conferidos. |

## Limites da conclusão

Foi verificada a implementação local e seu comportamento com dados sintéticos e transportes injetados. Compatibilidade autenticada, permissões/quota da conta, custo efetivo, liquidez de saída, segurança dos contratos e cotações executáveis continuam sem qualificação. A janela temporal de 60 segundos não foi calibrada com resultados reais. Modelo, esforço, tier e sandbox efetivos dos revisores não foram observáveis. Nenhuma ordem, assinatura de carteira, transferência, resgate de Rewards ou retorno financeiro foi produzido por esta entrega.
