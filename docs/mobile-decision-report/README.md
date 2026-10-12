# Relatório offline para decisão humana

Abra `example.html` diretamente no navegador. É um único arquivo estático com dados sintéticos, gerado com relógio fixo em 2026-10-09T00:00:00.100Z. Não contém dados reais, conexão de carteira, inferência executada ou proposta financeira qualificada. O status temporal representa somente esse instante; reavalie a entrada ao consumir qualquer relatório posterior.

`example.json` é a projeção para inspeção. `fixtures.json` contém as sete entradas sintéticas: fresh, missing, stale, future, contradiction, invalid e known_costs. A entrada invalid deve falhar; nunca é convertida em relatório válido.

## Reproduzir sem configuração privada

Na worktree `C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader`:

```powershell
bun run --no-env-file ./src/mobile-decision-report/example.ts
bun --no-env-file test ./src/mobile-decision-report ./web/src/lib/dex-report.test.ts
bun run --no-env-file ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.verification.json
```

Para inspeção local opcional, `bun run --no-env-file ./src/mobile-decision-report/preview.ts` serve somente o exemplo sintético em `http://127.0.0.1:4180/`. Encerre com Ctrl+C. O preview não oferece endpoints financeiros. Nesta validação o preview foi encerrado, a aba temporária foi fechada e a largura do navegador foi restaurada.

## Contrato de integração

As três funções de `src/mobile-decision-report` recebem a mesma entrada desconhecida e opções explícitas:

- `projectMobileDecisionReport(input, { now_ms, current_binding_sha256? })` produz a projeção tipada;
- `exportMobileDecisionJson(input, options)` produz JSON sanitizado;
- `exportMobileDecisionHtml(input, options)` produz o documento único.

O schema de entrada é `mobile_decision_input_v1`. Exige snapshot_id, revision decimal string, origin (`synthetic_fixture` ou `local_import`), dex_report aceito pelo parser existente, source_time_ms/fetched_at_ms nullable, max_age_ms (1 a 3.600.000), api_cost_usd decimal string ou null e jev null ou contexto explicitamente fornecido. Campos faltantes e estruturas inválidas falham com `Invalid mobile decision report.` sem ecoar o conteúdo. Campos extras são descartados. Não passe `example.json` aos exporters: a saída projetada não é a entrada.

O módulo usa `node:crypto` local e deve ser chamado no servidor/Bun. Não importe o projector/exporter em componentes client do Next. Não há endpoint existente `src/dashboard/reports-server.ts` neste checkout; a próxima integração precisa identificar o produtor e a rota reais antes de ligar esta seam.

O produtor deve preencher o horário real da fonte sem substituí-lo pelo horário de coleta. O consumidor deve reprojetar com o instante atual e o binding vigente quando tempo, identidade, revisão ou conteúdo mudarem. O hash vincula o envelope validado e os fatos; não autentica a origem. Não habilite execução por um hash, label `okx_authenticated`, contexto importado ou checkbox humano.

Contexto JEV importado exige id, model, version, evaluated_at_ms, bound_facts_sha256, observations/limitations limitadas, input_tokens/output_tokens nullable e cost_usd decimal string ou null. Continua `provided_unverified`; ausência é `not_evaluated`. Contexto incompatível ou expirado perde as observações ativas e fica invalidado. As limitações e metadados permanecem como histórico não verificado. Custos nulos, cobertura total e quota continuam desconhecidos. Estimativas de trade/gas são exibidas separadamente, sem somatório ou lucro líquido.

## Verificação e limites

`VERIFICATION.json` registra comandos, saídas exatas privadas por hash e exit codes: 18 testes passaram, 170 assertions, zero falhas; análise estática passou. `BROWSER.json` e quatro JPGs registram a aquisição no navegador: viewports 360x800 e 390x844, sem overflow horizontal com detalhes abertos, fonte base 16 px, escolhas 44 px e foco azul visível de 3 px. Enter, Tab, Space e setas alcançaram detalhes, opções e notas; reload descartou o rascunho. Nenhum script, formulário ou recurso externo foi observado no DOM.

A revisão de padrões do primeiro candidato encontrou pontuação proibida em texto importado. Um teste de regressão reproduziu a falha. O HTML agora exibe ponto médio como `/` e traços longos como `-`; o JSON mantém o texto original, o binding e todos os valores financeiros exatos. O exemplo regenerado permaneceu byte a byte igual ao HTML capturado no navegador (SHA-256 `1af025fb8585a895e0c3a07df9c4d97e77e158e438dc70b53b80561dbc8523f3`). Assim, as capturas e medições continuam vinculadas ao artefato final; o teste novo cobre a entrada importada corrigida.

Esses resultados verificam somente o incremento offline M01-M10. São emulação de viewport no navegador desktop e aquisição do integrador, não teste de toque em dispositivo físico, WCAG integral ou reprodução independente do navegador. A revisão independente usa cópias isoladas e trata separadamente padrões e SPEC; seus relatórios fixam a versão revisada.

Os campos humanos são rascunho temporário sem salvamento ou transmissão pelo documento. Não contêm botão de execução. O documento preserva os fatos exatos e os estados desconhecidos; não faz recomendação de compra/venda ou avaliação de retorno.

## Integrações reais ainda pendentes

O objetivo nativo G01-G17 permanece bloqueado. O checkpoint histórico de referência é `../real-integration/CHECKPOINT-BLOCKED-CONTINUATION-2.md`; este incremento não o reabre. Seu quadro descreve dependências observadas anteriormente, não uma nova inspeção de segredos ou entitlement.

| Critérios | Próxima evidência obrigatória |
| --- | --- |
| G01 | Integrar o incremento com ownership e baseline preservados; nenhum commit/staging/publicação foi feito nesta entrega. |
| G02 | Bootstrap/shutdown/restart tinham prova local. Revalidar a versão integral quando a integração mudar; não há prova de uptime contínuo. |
| G03/G05/G08 | Acesso próprio OKX Web3 por família Market/Balance/DEX v6, doctor sanitizado e respostas reais correlacionadas por endpoint, rede, unidades e validade. Dados Exchange v5 não substituem v6. |
| G04/G06/G13 | OKX Wallet real, gesto e consentimento do proprietário, eventos de conta/rede/recusa/reconexão e inventário exato da mesma carteira/rede/bloco. |
| G07 | Aquisição real das fontes do núcleo e invalidadores vigentes de identidade/tempo, dependente de G05/G06/G08. |
| G09/G10 | Credencial/acesso e consumo autorizados para a inferência JEV do aplicativo; resposta real vinculada ao snapshot e dez ciclos completos novos por ao menos duas janelas da maior TTL, com recuperação. Consulta do plugin não comprova inferência do aplicativo. |
| G11 | Build DEX real, deployment/proxy/bytecode/ABI atuais verificáveis, decoder completo e prova semântica, fees/reserva e simulação qualificada. Execução financeira continua OFF. |
| G12 | Entitlement e qualificação real por módulo/rede de DeFi/sinais/funding; capacidades não qualificadas continuam OFF. |
| G14 | Verificar os fluxos completos integrados, incluindo toque, reduced motion, texto/contraste e foco ainda não qualificados. M08 não conclui G14. |
| G15/G16 | Preservar gates de segurança e reexecutar checks pertinentes na versão integral final. Os checks históricos não são nova prova externa. |
| G17 | Revisão independente do fluxo integral final com todas as evidências reais. A revisão deste módulo offline não aprova G17. |

Nenhuma rede externa, API autenticada/paga, leitura de .env, conexão/assinatura de carteira ou transmissão financeira foi realizada pelo incremento. Custos faturados globais permanecem desconhecidos; hooks consultivos não concedem autorização nem são prova da integração.
