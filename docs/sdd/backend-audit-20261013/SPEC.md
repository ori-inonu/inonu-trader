# Auditoria do backend e correção do relatório de carteira

Objetivo observado: revisar integrações OKX Web3/Onchain OS, gestão de carteira e inteligência Jev/ML e corrigir falhas demonstráveis no escopo existente. Este ciclo implementa o adaptador de capturas do relatório offline de risco. Os demais achados permanecem no relatório de auditoria, com prioridade e dependências explícitas.

Fontes: `docs/sdd/dados-quant/SPEC.md` Q-01, Q-06 e Q-08; contrato de `src/quant/portfolio.ts`; especificação canônica de carteira em `docs/sdd/carteira-evidencia/`; reservas em `docs/sdd/inteligencia-decisao/README.md`. Não copiar nem substituir os critérios dessas fontes.

## Aceitação imutável deste ciclo

- BA-01: O CLI de capturas 15m usa sempre barras de 900000 ms. Captura com identidade diferente de KEY-USDT-SWAP, intervalo diferente, metadados inválidos ou estrutura inválida fica excluída com motivo. A ordem dos ativos não muda escala ou cobertura. Nenhuma interpolação ou conversão de intervalos.
- BA-02: Cada captura é auditada antes da combinação. Captura ausente, ilegível, vazia ou com menos de 31 candles utilizáveis fica excluída. Os demais ativos continuam calculáveis, com cobertura de valor e exclusões explícitas; valor desconhecido e posições de peso zero não restringem a grade.
- BA-03: Retornos são calculados somente na interseção cronológica das séries elegíveis, confirmadas e contíguas. Se não houver 31 candles comuns, o risco fica indisponível. Grade, quantidade, instante de captura e qualidade no instante de captura são informados; não declarar atualidade live de arquivo histórico.
- BA-04: O CLI usa o contrato público do adaptador, mantém a análise, cenário de estresse e rótulos de posições hipotéticas/informadas, e acrescenta evidência das capturas em JSON e texto. Erro de leitura de uma captura não interrompe a carteira inteira.
- BA-05: Testes públicos do adaptador e do processo CLI usam arquivos sintéticos offline. Executar regressões, núcleo quantitativo pertinente e typecheck. Não alterar src/quant, settings, desktop, inonu, web ou outras reservas; não usar credenciais, rede, ordens, inferência paga de aplicação ou ações externas.

## Plano e responsabilidade

Integrador root: novo `src/portfolio-analytics/captured-report.ts`, testes públicos, `scripts/quant-portfolio.ts`, teste CLI e documentos deste diretório. Baseline em cópia isolada, hashes registrados antes da integração. Revisores independentes recebem o baseline e estes critérios congelados. Integração somente se a fonte selecionada continuar igual ao baseline.

Fronteiras de TDD: relatório público de capturas e CLI executado com arquivos sintéticos. Confirmadas pela decisão Jev 317c611f-6846-4548-9f96-872f04f939c7, approved_by=jev_delegated, confidence=0.88; não é resposta humana. Prioridade escolhida pelo recibo 1ed6effe-6153-438f-a562-0c846a83290a, confidence=0.67. Custos faturados desconhecidos.

Exclusões: treinamento ou promoção de modelos, promessa de retorno financeiro, integração live sem evidência, mudanças na política de operações ou na cadência Kuru, publicação, staging, commit, push. Reservas concorrentes e estados não qualificados serão descritos na auditoria. Nenhuma fonte nem decisão Jev concede nova autorização.
