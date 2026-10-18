# Atualização pública com validade preservada

Adendo E01/E05, G02/G07/G13. Não altera o TTL de 60 s nem os critérios congelados. Consulta delegada Jev real: recibo `28839d1d-6b6b-4934-8878-1f88aa1471ae`, `approved_by=jev_delegated`, `human_response=false`; resposta preservada em PUBLIC-CADENCE-DECISION.json. Custo faturado desconhecido.

Observação no navegador servido: a taxa de funding pode chegar com idade anterior à coleta. Uma espera fixa de 60 s deixava intervalos com snapshot vencido; o botão só relia o snapshot local.

- PC01: após coleta ready, programar a próxima aquisição na metade da validade restante, limitada a 15–60 s; erro/bloqueio espera 60 s. Validade curta continua bloqueando quando vence, sem extensão artificial.
- PC02: atualização manual usa POST local com Origin permitido e solicita nova aquisição pública. Requisições sobrepostas compartilham a aquisição pendente. Não inicia o núcleo autenticado nem pede identidade de wallet.
- PC03: cada aquisição mantém GETs fixos sem chave, fila pública serial de 1 requisição/s, sem retries internos e validação separada do relógio público. Execução financeira permanece desabilitada.
- PC04: polling da tela continua GET a cada 5 s; botão usa POST e deadline de 30 s, compatível com os limites finitos das quatro leituras. Falha remove valores utilizáveis e permite nova tentativa.

Verificação: teste de cálculo da cadência e rota manual em src/real/public-runtime.test.ts e server.test.ts; teste do transporte da UI; atualização real no navegador e nos recibos da coleta. Testes injetados não qualificam a fonte real.
