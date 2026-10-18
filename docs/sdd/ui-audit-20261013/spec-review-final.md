Revisor independente: `/root/spec_review`; CODEX_THREAD_ID `01a13671-47e3-7470-8b48-0918ebca0858`, CODEX_SESSION_ID `01a13627-77f2-7cd2-909b-5d85a8cfa1d8`. Não implementei o candidato. Examinei exclusivamente cópias isoladas e a captura local indicada pelo integrador; só este relatório foi escrito.

SPEC SHA256 `e5cc175407637b903721cb8415bfe4ea89004d94c7c28f1978d40ed887706d55`, inalterada. Os 24 caminhos de final-manifest e quatro dependências concorrentes adicionais conferiram antes/depois, sem divergências. Manifest SHA256 `aa388f0b7b0a7d23d79294d49c11ab4a6748b7d24d387c47f582c5bb523f85e9`. O delta frente a review-combined contém somente MesaView, InstrumentHeader e os dois arquivos market-inputs; os hashes históricos de reconciliation para os dois componentes foram substituídos explicitamente pelo manifesto final.

- UI-1: preservado. IDs por instância e relações aba/painel permanecem intactos; regressões afetadas passaram.
- UI-2: preservado. Seleção válida abre o painel; revealDock restaura completo sem alterar altura ou preferências. Mouse/teclado mantêm a implementação já revisada.
- UI-3: parcial na evidência visual final. Regras de ações móveis e rolagem de Carteira/Radar permanecem; a revalidação da matriz de quatro dimensões está a cargo do integrador. Há sobreposição confirmada abaixo.
- UI-4: P2 anterior corrigido. market-inputs.ts:7-15 escolhe a fonte pelo objeto, preserva null e bloqueia derivadas OKX. MesaView.tsx:404-407,486-490 compartilha esses dados com cabeçalhos/gráfico; InstrumentHeader.tsx:51 anuncia “Aguardando dados on-chain”. Testes cobrem vazio, resposta parcial e retorno à OKX.
- UI-5: pendente. As cinco rotas têm evidência anterior, mas esta versão contém defeito confirmado de layout.
- UI-6: preservado no delta. Nenhuma alteração aos contratos financeiros, texto proibido ou animação pulsante; nenhuma operação financeira executada nesta revisão.

P2, UI-5, web/src/components/Desk/MesaView.module.css:75,80: em final-wallet-1024.png, 1024x768, o preço 83.030 aparece apenas como “83”, coberto pelas ações. decisionBar não quebra linha e permite que as ações ocupem o espaço da cotação. SPEC.md:13 exige “Corrigir defeitos confirmados de layout ou navegação dentro do escopo”. Reservar espaço à cotação/reorganizar as ações e revalidar 1024x768 e 1440x900. Captura SHA256 `0cfacd9e3194b20cdcf02dc1ea0beb040a156cf72b086b92c7b650a48c474035`.

Logs conferidos: red 1/3; green 9/0; afetados 171/0; build e TypeScript passaram. Cinco falhas anteriores da suíte completa não foram reexecutadas nem certificadas como resolvidas. Sem outro achado no delta. Não aprovo esta versão com clipping; navegador crítico e integração no original permanecem pendentes. Wallet conectada, backend disponível e extensão instalada continuam não certificados.
