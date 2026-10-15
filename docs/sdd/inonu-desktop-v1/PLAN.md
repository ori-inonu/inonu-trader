# PLAN - Inonu Trader v1 (plano de implementação)

Estado: **em execução** desde 2026-10-12 (o usuário fixou o objetivo de iniciar o plano, SPEC D-U5). Revisão 2. SPEC: [SPEC.md](SPEC.md). Tarefas: [TASKS.md](TASKS.md). Posse dos caminhos: [OWNERSHIP.md](OWNERSHIP.md). Estado e evidência: [CHECKPOINT.md](CHECKPOINT.md). Este plano é um modelo de registro: não concede autorização, não agenda nada e não cria metas.

## 1. Princípios de execução

1. **Menor entrega verificável.** Cada tarefa de [TASKS.md](TASKS.md) é um ciclo: teste que falha (saída vista), implementação mínima, verificação real, revisão independente quando a onda fecha.
2. **Aditivo.** O working tree tem 110 caminhos de outras sessões ([OWNERSHIP.md](OWNERSHIP.md)). Código novo vai para pastas novas (`src/desktop/`, `src/intel/`, `src/inonu/`, `web/src/lib/rastreador/`, `web/src/lib/wallet/`, `web/src/app/rastreador/`, `web/src/app/doctor/`, `installer/`). Arquivo "quente" só pelo integrador e depois de `git status --short -- <caminho>` nas duas árvores (`jev-trader` e `jev-trader-main`) **e** de conferir a data de modificação (um arquivo mexido há minutos pertence a uma sessão ativa). Commits só dos caminhos próprios, nunca `git add -A`. Nenhum worktree alheio é removido.
3. **Servir do working tree.** A interface do usuário roda no working tree primário (porta 3031); não construir a UI a partir de um commit antigo.
4. **Sem execução externa sem autorização:** publicar, instalar fora de pasta temporária, gastar com o modelo, pagar x402, assinar, apagar `.env`.
5. **Texto exibido** em português sem acentos, sem ponto médio, travessão ou meia-risca, sem animação piscante; "Inonu" é o assistente e "Jev" só proveniência do modelo.
6. **Next 16 fora do padrão.** Antes de escrever código web, ler `web/node_modules/next/dist/docs/` (regra de `web/AGENTS.md`).
7. **Evidência em quatro estados** (QLT-6): configuração válida (testes), carregado em sessão nova (instalação limpa), funcionando ao vivo (sonda real e captura) e ganho medido (ledger e backtest pareado). O que não foi medido é registrado como "não medido".
8. **Linha de base antes de cada onda** (T0.5): o working tree tem mudanças de outras sessões, então `test:all` e `typecheck:all` são registrados antes de começar.

## 2. Ondas

| Onda | Tarefas | Estado | Portão de saída | Dependência externa |
| --- | --- | --- | --- | --- |
| **0** | T-DOC-1 a T-DOC-10, T0.1 a T0.5 | **feita** (T0.2 runbook e T0.3 pedidos ao usuário seguem abertos) | SPEC, PLAN, TASKS congelados com hash; revisão independente resolvida | tela desbloqueada, hora do Windows, plano OnchainOS e data da chave |
| **A** dor imediata | T3.2, T3.3, T3.9, T3.6, T3.5, T4.1, T4.2, T4.3, T4.4, T4.7 | **T3.2 verificada**; T4.1 elegível; as demais aguardam T3.3 e a sessão que amplia o catálogo | busca sem "fora do contrato"; abas com dado real; ícones; redes do provedor | coordenar com a sessão de `config-onchain-smartmoney` (catálogo e abas) |
| **B** instalável | T1.1 a T1.11, T2.1 a T2.5 | **T1.2 a T1.10 verificadas**; T1.1 bloqueada (tela), T1.8 (Doctor) e T1.11 elegíveis; M2 elegível | instalação limpa com fumaça verde; cofre lido sem `.env` | T1.1 exige tela desbloqueada |
| **C** inteligência | T3.4, T3.10 a T3.15, M5 (T5.1 a T5.10), M6, M7 (T7.1 a T7.11) | não iniciada (T5.1 elegível) | zero chamada de modelo em 10 min sem clique; Brief até 2 KB; vetores | T7.8 exige autorização do usuário |
| **D** produto | M8 (T8.1 a T8.5), M9 (T9.1 a T9.8) | não iniciada | Rastreador na barra; carteira conecta e lê; ticket sem envio | extensão da OKX Wallet no Edge; T9.8 só documento |
| **E** fechar | M10 (T10.1 a T10.5), M11 (T11.1 a T11.5), T3.1, T3.7, T3.8 | não iniciada | suítes, typecheck e build verdes; parecer independente; CHECKPOINT com os quatro estados | nenhuma |

Ordem dentro da onda A (cada passo termina verde antes do próximo): T3.2 (**feito**); T4.1 (teste de contrato contra o núcleo real, depois erros distintos, autoteste e banner); T3.3 e as famílias T3.9 a T3.15 **coordenadas** com `src/onchain-read/**` da outra sessão; T3.6 e T4.2 (redes dinâmicas); T3.5 e T4.3 (ícones); T4.4 e T4.7 (abas e busca real).

## 3. Caminho crítico

```
T-DOC-9 -> T0.4
T1.2 -> T1.3 -> T1.4 -> T1.7 -> T1.9 -> T1.10                    (instalável: feito até aqui)
T1.4 -> T1.8 (Doctor), T1.11 (/console fora)
T1.2 -> T2.1 -> T2.2 -> T2.5 -> T2.3                              (cofre e provisionamento)
T3.2 -> T3.3 -> T3.4 -> T3.9..T3.15 -> T3.5/T3.6 -> T4.2/T4.3/T4.4 (gateway e UI)
T5.1 -> T5.2 -> T5.3/T5.4/T5.8/T5.9 -> T6.1 -> T7.1 -> T7.2 -> T7.3 -> T7.4 -> T7.5 -> T7.6/T7.9..T7.11 (inteligência e Inonu)
T3.3 -> T8.2 -> T8.3; T5.3/T6.3 -> T8.4; T7.3 -> T8.5                (Rastreador)
T1.1 -> T9.1 -> T9.2; T3.3 -> T9.4/T9.5 -> T9.6 -> T9.7             (carteira)
```

Pode andar em paralelo, por **donos distintos e arquivos exclusivos** (e só com autorização de delegação): trilha instalável (M1 e M2), trilha gateway e UI (M3 e M4), trilha motor (M5 e M6). Um único integrador faz as edições nos arquivos quentes (`PriceChart.tsx`, `MesaView.tsx`, `JevStage.tsx`, `DeskRail.tsx`, `mesa-model.ts`, `src/server.ts`, `OnchainTabs.tsx`, `web/src/lib/onchain/client.ts`).

## 4. Colisões e arquivos quentes

Estado de 2026-10-12 22 h: 110 caminhos de outras sessões, sem mudança desde o início da implementação, mas a sessão de `config-onchain-smartmoney` (etapa E7 aberta) editou `web/src/lib/onchain/useOnchainResource.ts` minutos antes e já tem fixtures do catálogo da Fase 2. Regra: antes de cada edição, `git status --short -- <caminho>` nas duas árvores e a data de modificação; se aparecer modificado por outra sessão, criar arquivo novo ou pedir integração ao dono. [OWNERSHIP.md](OWNERSHIP.md) lista a zona de cada arquivo que as tarefas tocam e, na seção 5, o que esta sessão alterou.

## 5. Próximos ciclos elegíveis

1. **T1.8 Doctor** (rota `/doctor`, relógio medido, extensão, porta, credenciais, sonda): pasta nova, sem colisão.
2. **T2.1, T2.2, T2.5** (cofre com cache, importação só dos quatro nomes, comando de provisionamento): `src/desktop/`, `scripts/`; o `store.ts` entra pelo integrador.
3. **T5.1 a T5.5** (coalescer, footprint, fatores, limiares) em `src/intel/`: puro, com vetores de [flow-engine.md](flow-engine.md).
4. **T4.1** (erros distintos e autoteste) pelo integrador, depois de conferir a data de `web/src/lib/onchain/client.ts` e `onchain-rows.ts`.
5. **T1.11** (`/console` fora) no núcleo e, pelo integrador, no link da barra.
6. **T1.1** quando a tela estiver desbloqueada.

## 6. Comandos de verificação do projeto

`bun --no-env-file run test` (suíte raiz, `--parallel=1 --timeout 15000`), `bun --no-env-file run --cwd web test`, `bun --no-env-file run typecheck:all`, `bun --no-env-file run build` (Next; reescreve o `.next` que `next start` de outras sessões usa, avisar antes). Teste isolado: `bun --no-env-file test <caminho>`. Instalador: `bun --no-env-file run scripts/build-desktop.ts` e `scripts/desktop-smoke.ts`. Para a interface, usar o navegador embutido contra o núcleo (`src/desktop/main.ts --no-browser`) nas larguras 1600x900, 1280x720, 1100x700 e 390x844.

## 7. Orçamento e custo conhecidos

OnchainOS: 100 mil Basic e 100 mil Premium por mês no plano gratuito; o teto padrão do gateway é 50 mil por camada; um pedido ao Inonu custa cerca de 5 Basic e 6 Premium (cerca de 16 mil pedidos por mês **se nada mais usar Premium**); o lote em `POST` pode contar N chamadas (a medir em T3.8). Modelo: custo medido uma vez no trader Kuru (3 decisões por US$ 0,000142), desconhecido para a mesa OKX até T7.4; nenhuma chamada paga sem autorização (T7.8). Testes usam modelo falso.
