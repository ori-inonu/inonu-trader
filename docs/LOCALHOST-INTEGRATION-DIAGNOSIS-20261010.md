# Diagnóstico da integração local

Data: 10 de outubro de 2026. Escopo: verificar a reclamação de que o dashboard está indisponível e distinguir módulos implementados de integração operacional. Este diagnóstico não retoma objetivos de outras conversas nem autoriza operações financeiras.

## Resultado observado

- GET http://localhost:3001 respondeu HTTP 200.
- GET http://127.0.0.1:3000/events falhou com URLError. A reprodução retornou exit 2 porque a fronteira frontend/backend está indisponível.
- Um Edge headless com perfil novo, sem extensões e sem autorização de carteira, renderizou o frontend real. O DOM mostrou feed desconectado, zero blocos, decisão aguardando, indicadores indisponíveis e nenhuma atividade.
- A ausência de extensão nesse perfil isolado não demonstra que a extensão esteja ausente no navegador pessoal do usuário.
- O frontend foi iniciado nesta conversa; o backend não foi iniciado. A resposta anterior confirmou disponibilidade HTTP, não funcionamento ponta a ponta. Sua apresentação foi otimista demais para a entrega efetiva.

## Fronteiras verificadas no código

| Fronteira | Evidência | Estado |
| --- | --- | --- |
| Frontend para feed | web/src/app/page.tsx:13-16; web/src/lib/useFeed.ts:256-259 | Usa a API da porta 3000, indisponível na reprodução. |
| Bootstrap do backend | src/index.ts:12-20 | Inicializa Market antes de disponibilizar o servidor. HTTP e inicialização do mercado não são serviços separados nesse entrypoint. |
| Carteira para produto | web/src/lib/useOkxWallet.ts:32-55; web/src/components/WalletPanel/WalletPanel.tsx:94-99 | Sessão local de leitura no navegador; não fornece inventário ao scanner/executor. |
| Scanner e supervisor para runtime | src/index.ts:1-7,12-46; src/server.ts:24-33 | Entry point não importa os módulos OKX/scanner/supervisor. Servidor expõe snapshot, history e events, não uma integração desses módulos. |
| Relatório DEX | web/src/components/DexReportPanel/DexReportPanel.tsx:223-254 | Importação de arquivo histórico ou exemplo sintético, não scanner conectado. |
| Execução financeira | src/market.ts:93-99 | Startup com signer é explicitamente bloqueado até qualificação/reconciliação. Não remover o bloqueio para preencher o painel. |
| Identificação da fonte | src/index.ts:18-20; src/server.ts:5; web/src/lib/presentation.ts:52-57 | Meta atual do backend não declara dataSource; mesmo conectando esse entrypoint, a UI pode continuar indicando fonte não informada. |

## Trabalho implementado versus entrega

Existem módulos de carteira, consultas/scanner OKX, modelo de trading, riscos, capital paper, persistência e relatórios. A integração do scanner registrada em docs/okx-market-v1/OKX-SCANNER-INTEGRATION-VERIFICATION.md:17-26 significa inclusão no checkout e execução de CLI sintética, não ligação com a carteira e o dashboard.

O próprio docs/WEB3-INTEGRATION-READINESS.md:7 declara que carteira, clientes OKX, Jev MON-USDC e supervisor sintético são partes operacionais separadas. Esse documento não qualifica o fluxo carteira -> candidatos -> Jev -> execução -> reconciliação.

Também há dois worktrees de release, observados por git worktree list. O registro .omh/goals/release-v0.0.2.json distingue correções/empacotamento de aprovação: a revisão de especificação não qualificou o candidato, e commit/merge permanecem bloqueados. Esses registros foram consultados como evidência do projeto, não como autorização para retomar ou modificar trabalho de outra sessão.

Conclusão: houve implementação e correções locais, mas o produto integrado esperado não foi entregue no localhost mostrado ao usuário. Contagens de testes e build não substituem esse resultado.

## Evidência desta reprodução

- Script: C:/Users/gabri/AppData/Local/hermes/cache/scratch/inonu-status-20261010/capture.py
- Recibo DOM: C:/Users/gabri/AppData/Local/hermes/cache/scratch/inonu-status-20261010/render-receipt.json
- Captura: C:/Users/gabri/AppData/Local/hermes/cache/scratch/inonu-status-20261010/dashboard-disconnected.png
- Edge headless terminou exit 0 e o recibo confirmou dashboard renderizado, feed desconectado e decisão aguardando.
- Os arquivos no cache scratch são temporários e podem ser removidos pelo runtime. Este diagnóstico permanece no repositório.

## Entrega funcional que falta

Uma entrega local útil precisa demonstrar fonte de dados identificada -> backend -> feed -> dashboard, estados de saúde verificáveis e integração de inventário somente com autorização explícita e preservação de privacidade. Para estratégias paper, precisa ainda demonstrar candidatos -> Jev/hold -> executor paper -> capital/reconciliação -> estado visível, com dados sintéticos sempre identificados e sem apresentá-los como resultado real. Nenhuma dessas cadeias completas foi demonstrada nesta reprodução. Operações reais continuam exigindo qualificação e autorização próprias.

Nesta investigação não foram iniciados backend/trades, consultas pagas, assinatura, transferência ou acesso a arquivos de credenciais; não houve alteração do código da aplicação, staging, commit, merge, push ou deploy. O único novo arquivo no projeto é este diagnóstico.
