# Consulta local do ecossistema OKX — v1

Objetivo: reunir a análise existente de Signals/Meme Pump e DeFi em um relatório local para identificar evidências e lacunas de pesquisa, preservando o funcionamento do bot e os critérios de liquidez, risco e retorno líquido.

Desenho e pontos de teste aprovados por decisão delegada ao Jev (`approved_by=jev_delegated`, recibo `f5d71665-ac03-445a-9d06-ea0f710ee434`). A recomendação não é autorização financeira nem resposta humana. Baseline: `51edcbc5a17a6805675268ed8dd9703df2b8eebe`.

## Critérios congelados

- **EC1 — Entrada e relógio:** `buildEcosystemReport` recebe capturas brutas: o par `tokens: {signals, scan}` e/ou o par `defi: {search, detail}`. Pelo menos um par completo é obrigatório. Rejeitar pares incompletos, relógio não inteiro seguro ou fora de `1..8640000000000000`, e `maxAgeMs` fora dos inteiros `1..3600000`. As duas análises usam o mesmo relógio e prazo.
- **EC2 — Tokens:** validar e recomputar a seção de tokens com `joinEvidence`; conservar identidades, fontes alegadas, proveniência não verificada, atualidade, risco, liquidez indicativa e pendências desse contrato. Um relatório pronto ou uma classificação importada não substitui capturas brutas.
- **EC3 — DeFi:** validar e recomputar a seção DeFi com `buildDefiReport`; conservar cobertura parcial, associação não verificada, unidade do rendimento, TVL, custo incompleto e atualidade desse contrato. Não associar um produto DeFi a um token por nome, símbolo ou ID semelhante.
- **EC4 — Saída:** schema `okx_ecosystem_research_v1`, `comparedAtMs`, `maxAgeMs`, seções `tokenEvidence`/`defi` ou `null`, e cobertura `included`/`not_supplied`. Proveniência permanece `unverified`; execução `not_qualified`; `netReturnUsd`, `executableExitLiquidityUsd` e `totalCostsUsd` permanecem `null`, mesmo diante de sinais positivos, APY alto, TVL elevado ou taxa anunciada zero. Incluir lacunas explícitas de segurança, venda executável, custos e origem verificada. Não produzir ranking, indicação de compra/venda ou projeção de ganhos. Não alterar as entradas.
- **EC5 — Importação local:** o CLI aceita pares `--signals FILE --scan FILE` e/ou `--defi-search FILE --defi-detail FILE`, com `--max-age-ms` obrigatório. Aceitar ordem livre; rejeitar opções desconhecidas, duplicadas, incompletas, valores inválidos e combinações com `--help`. Validar todos os argumentos e caminhos antes de qualquer leitura. Reutilizar o leitor existente de arquivo regular local, até 1 MiB, UTF-8 estrito e JSON estrito. Rejeitar URLs, UNC, dispositivos e streams alternativos. Falhas: stdout vazio, exit 1, apenas `okx-ecosystem: <codigo>\n` em stderr, sem caminhos, conteúdo bruto ou stack.
- **EC6 — Demonstração:** sem argumentos, emitir JSON determinístico com fixtures existentes declaradamente sintéticas, sem chamadas de rede, `.env`, modelo, carteira ou executor. `--help` sozinho explica a consulta em português. A rota `bun run okx:ecosystem` usa `--no-env-file`. Demo inclui evidência antiga e atualidade desconhecida para expor as restrições.
- **EC7 — Integração e verificação:** limitar alterações a novo módulo, CLI, testes, guia, script do package e link no README. Preservar validadores existentes, bot, operador, System One, execução, dependências e mudanças concorrentes. Exercitar os pontos públicos com fixtures independentes e processos reais do CLI; verificar regressões dos módulos afetados e tipos. Revisões independentes de SPEC e padrões avaliam o candidato contra esta baseline e estes critérios.

## Exclusões e limites

Rewards, Alpha Radar, portfólio, feeds autenticados, contexto enviado a modelos e endpoints HTTP não são implementados nesta entrega. A composição de capturas locais não comprova autenticidade, conexão da extensão, elegibilidade pessoal, rendimento realizável ou ganho financeiro. HTTP status/URL/horário pendentes da pesquisa anterior continuam pendentes.

## Fontes locais do contrato

- `src/okx-evidence/report.ts` e `docs/okx-evidence-v1/SPEC.md` — tokens e pendências.
- `src/okx-defi/report.ts` e `docs/okx-defi-v1/SPEC.md` — produtos e economia incompleta.
- `src/okx-derivatives/local-file.ts` — limite de leitura local.
- `CONTRIBUTING.md` — isolamento entre pesquisa, mudança visual e execução financeira.

Pontos públicos aprovados: builder puro e CLI/rota do package em subprocesso. TDD em ciclos verticais; relógio fornecido ao builder, relógio atual na importação real. Dados sintéticos não certificam retorno nem funcionamento live.
