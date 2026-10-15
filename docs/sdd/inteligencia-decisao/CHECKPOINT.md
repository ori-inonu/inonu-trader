# Checkpoint: inteligência de decisão do Inonu

Estado em 2026-10-13, 15:35. Este arquivo é fonte, não autorização: nada aqui permite chamar o modelo, assinar ou enviar ordem.

## O que existe e foi verificado

| Parte | Onde | Evidência |
| --- | --- | --- |
| Porte de indicadores e SMC para o backend, com paridade de vetores | `src/intel/ta/` | 47 testes, vetores do Python, teste de deriva contra a cópia do web |
| Vetor de atributos sem olhar o futuro | `src/intel/features/` | 72 atributos, nulo com motivo, 17 testes |
| Rotulador, armazenamento append-only, gravador, backfill, Placar, registro de decisões | `src/outcomes/` | 105 testes |
| Veredito: plano de risco, motivos, portões, leitor da consistência | `src/verdict/` | 69 testes, incluindo 4000 entradas aleatórias (a ação é sempre a do modelo) e o contrato com o leitor do web em 3000 |
| Aprendiz: logística, árvores, isotônica, walk-forward com purga, portão com Holm, artefato | `src/intel/ml/` | 51 testes; controle sintético: 0 de 12 promovidos em ruído, 12 de 12 com borda plantada |
| Cartão, glossário, perfil, Placar e painel Medicao | `web/src/components/Veredito/`, `web/src/lib/veredito/`, `web/src/lib/glossario/` | 66 testes; `next build` de exportação compila |
| Rotas | `GET /inonu/placar`, `GET/PUT /inonu/perfil` | testes de guarda (origem, intenção, método) |
| Gravador ao vivo, sem modelo | núcleo com feed ao vivo | `evidence/C1-ao-vivo.md`: 68 min, 56 fotos, 44 rótulos, 0 erros, 0 chamadas ao modelo |
| Pesquisa do aprendiz com dado real | `scripts/ml-research.ts` | `evidence/C3-pesquisa-2026-10-13.md`: nenhum modelo promovido, por quê |

Suítes completas desta data: raiz 5084 passam, 2 skip, 2 falhas que são temporização sob carga e passam isoladas
(`src/onchain-read/client.test.ts` e `scripts/okx-defi.test.ts`, ambos de outra frente); web 2589 passam, 0 falham;
`typecheck` da raiz e do web limpos; `next build` de exportação compila.

## O que NÃO foi feito, e por quê

1. **Nenhuma chamada ao modelo.** O instalável tem a chave configurada; `today.calls` ficou em 0. O cartão do Veredito, portanto, **não foi visto com uma resposta real**; foi verificado por testes de renderização, pelo contrato com o leitor e pelo build. O painel Medicao foi visto num navegador real, lendo o núcleo ao vivo.
2. **Gancho de consistência do modelo (INT-2.1 a 2.3).** O tubo está pronto (`src/verdict/judge.ts`, `InsightBox`, `decision-log`), falta o gancho em `createJevInonuModel`, de outra sessão. Aumenta o custo de cada clique em 250 a 350 tokens; precisa de autorização. Ver "Pedido de ligação" em `TASKS.md`.
3. **Brief com contexto (tendência, volatilidade, custo, derivativos) para o Jev.** Depende do mesmo arquivo e de mudar o Brief. Adiado para C2.
4. **Veredito de token on-chain com plano.** Hoje o token fica sem Veredito.
5. **C4 (Smart Money v2) e C5 (modo simples e avançado em todas as páginas).** Não iniciados. C5 mexe em arquivos quentes da sessão da mesa (`MesaView`, `SettingsView`); o perfil de risco não foi montado em Configurações por isso, e vive no cartão.
6. **Visão Oportunidades e alertas "cenário se formando" (INT-3.10).** Dependem de um modelo promovido, e nenhum foi.
7. **Medir o fluxo e o dinheiro grande.** Só dá com dias de gravação ao vivo. `docs/sdd/inonu-desktop-v1/evidence/T6.6-zonas-nao-medido.md` continua valendo.
8. **Revisão independente (AC-INT-10).** Pede autorização para delegar; não foi pedida.

## Desvios que o usuário deve saber

- Editei três pontos que eu mesmo tinha marcado como "não editar" ou que a sessão da mesa usa: `web/src/components/Desk/InonuAsk.tsx` (um bloco), `web/src/lib/inonu/client.ts` (campo `veredito`), `web/src/components/Desk/Dock/DockInonu.tsx` (uma linha). Conferi antes que estavam quietos e os testes dos dois lados passam; o desfazer é trivial (ver `README.md` desta pasta).
- A sessão da mesa acrescentou um teste em `src/outcomes/decision-log.test.ts` pedindo que o envoltório repasse `options` e `cancelRequest`; atendi (o envoltório ficou genérico) e ajustei o tipo de uma variável do teste para o `tsc` passar.
- O Doctor tem exatamente oito itens (WIN-8, congelado): o estado do gravador foi para a aba Inonu, não para o Doctor.
- `src/inonu/source.ts` ganhou o método `analysis` (aditivo); `src/inonu/http.ts` ganhou as rotas `placar` e `perfil`; `src/desktop/handlers.ts` ganhou a montagem (`createOutcomes`).

## Como retomar

1. `git status --short` e conferir as datas dos arquivos quentes antes de qualquer edição.
2. Deixar o instalável aberto por dias: o gravador acumula em `<data>/outcomes`. Depois, rodar `scripts/ml-research.ts` (histórico) e, quando houver dias de fotos ao vivo, uma variante sobre `store.snapshots()` com fluxo.
3. Se o usuário autorizar o custo extra por clique: aplicar o pedido de ligação e medir tokens e latência com teto.
4. `INONU_RECORDER=off` desliga o gravador e o registro de decisões sem reiniciar.
