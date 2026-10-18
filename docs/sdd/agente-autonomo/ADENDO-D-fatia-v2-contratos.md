# Adendo D: contratos da fatia v2 do backend (2026-10-15)

Pedidos do Codex nas secoes 98 a 101 da coordenacao, aceitos pelo dono por delegacao. Este adendo fixa os contratos ANTES de implementar. A fatia v2 muda arquivos do backend congelado em 2026-10-14 (manifesto de 95 arquivos): sai com manifesto novo e aviso ao Codex. Nada aqui opera dinheiro nem liga fatia D.

## 1. O que entra na v2 (backend)

| ID | Contrato | Caminhos | Estado |
| --- | --- | --- | --- |
| V2-1 | Memoria de taxa de rede por rede (ADENDO-C, FEE-1) | `fees.ts`, `wire.ts` | feito: 8 testes, grava `fees.json` a cada cotacao (compra ou venda) |
| V2-2 | Projecao de recursos (cota do provedor) calculada no nucleo e entregue em `GET /agent/status` como `resources` | `resources.ts`, `wire.ts`, `service.ts` | feito, a HUD desenha |
| V2-3 | Guardas de custo da execucao como FATO no status: `autopilot.guards` | `guards.ts`, `cli.ts`, `swap-args.ts`, `wire.ts` | feito, a HUD desenha |
| V2-4 | Produtor dos metadados de decisao (envelope prospectivo, secao 98 e 101 do Codex) em jornal proprio | `decision-metadata.ts`, `cycle.ts`, `wire.ts` | feito: `decisions-meta.jsonl` |
| V2-5 | Reserva do coin nativo por taxa medida, fatos de taxa no Brief e recusa antes de assinar (ADENDO-C, FEE-2 a FEE-4) | `exit.ts`, `cli.ts`, `cycle.ts`, `model.ts`, `candidates.ts` | PARCIAL: FEE-3 feito (chave `k` por compra no Brief, so onde ha taxa medida); FEE-2 (reserva por taxa medida) e FEE-4 (recusa antes de assinar) a fazer |

## 2. V2-2: recursos no status

- `resourceView({ budget, now })` devolve a projecao `ResourceCapacity` de `src/decision-review/resource-capacity.ts` ou `null`. Entrada: o contador local do gateway (`gateway.budget()`), com `observedAtMs` igual a hora da resposta; conta da OKX NAO lida, portanto `account` e `unreported`; `schedules` vazio (lista vazia nao e demanda zero).
- O status ganha `resources: ResourceCapacity | null`. A tela calcula a idade a partir de `observedAtMs` original e nao rejuvenesce; escreve "CONTADOR LOCAL" (o que esta maquina enviou) e "CONTA NAO LIDA" quando for o caso; desconhecido nunca vira zero.
- Aceite: teste do status com gateway falso (campo presente e identico a `resourceView`), com gateway sem `budget` (campo `null`), e a UI renderiza as tres faixas e a idade.

## 3. V2-3: guardas de custo como fato

Hoje os vetos de custo do executor (impacto 3, 5 e 10 por cento, imposto 5 por cento, derrapagem 2, 3 e 8 por cento, reserva nativa de US$ 5) estao em constantes privadas e a tela mostra regras antigas (pedido minimo de US$ 10, barra de conviccao). Contrato: uma unica fonte exportada, lida pelo executor e pelo status.

```
autopilot.guards = {
  impactPct:   { buy: 3, sell: 5, protecao: 10 },
  taxPct:      5,
  slippagePct: { buy: 2, sell: 3, protecao: 8 },
  buyCostShareOfStop: 0.3333,        // buyCostCapPct: um terco do stop do perfil
  nativeReserve: { kind: "fixa", usd: 5 }   // vira { kind: "taxa_medida", ... } em V2-5
}
```

Aceite: teste de que os numeros do status sao os mesmos que o executor usa (importam a mesma constante; um teste que muda a constante muda os dois). A HUD mostra essas linhas como "VETO DE CUSTO NA EXECUCAO, ESCOLHA DO CODIGO" e nao mostra mais "PEDIDO MINIMO", "BARRA" nem "RISCO POR OPERACAO" como regra em vigor.

## 4. V2-4: metadados de decisao

Contrato do Codex (secao 98): `metadata = { schemaVersion: 1, sourceRecordHash, snapshotHash, decisionVersion, evaluatorHash, askedAtMs, answeredAtMs, recordedAtMs, factAvailableAtMs, arm }` (lista exata de chaves conferida contra `ProducerDecisionMetadata` e `producer()` em `src/decision-review/evolution/agent-episode.ts`, todos os quatro hashes em 64 hexadecimais), em envelope SEPARADO do registro que e hasheado (`sourceRecordHash` nao entra no `ConsultRecord`).

Produtor (jornal novo `decisions-meta.jsonl` na pasta do agente, uma linha por consulta primaria, escrita logo depois de `briefs.jsonl`):

| Campo | Origem real |
| --- | --- |
| `sourceRecordHash` | SHA-256 hex (64) do texto EXATO da linha escrita em `briefs.jsonl` |
| `snapshotHash` | SHA-256 hex (64) completo do Brief exato (`hashOf(brief)` de `cycle.ts`, hoje cortado em 16 no registro; o Codex o recompoe de `{ v, carteira, chaves, posicoes, compras, contexto, historico, execucoes?, mandato }` e confere) |
| `askedAtMs` | `deps.now()` imediatamente antes de `model.choose` (depois de `budget.begin`) |
| `answeredAtMs` | `deps.now()` imediatamente depois de `model.choose` voltar com resposta |
| `recordedAtMs` | `deps.now()` depois de a linha de `briefs.jsonl` ser gravada |
| `factAvailableAtMs` | `deps.now()` quando o Brief ficou pronto (antes de pedir ao modelo): o ultimo fato nele e anterior a este instante |
| `decisionVersion` | SHA-256 hex de um JSON canonico `{ criteria, legend, briefVersion, model, questions }`, onde `questions` e o digest de todos os textos constantes que o modelo le (objetivo, entradas, criterios de postura, de mandato e de cada postura de compra e venda, legenda do Brief). Muda quando QUALQUER texto de pergunta muda |
| `arm` | `"A"` (nao existe braco B) |
| `evaluatorHash` | SHA-256 de um JSON canonico da regra que MEDE o resultado da decisao hoje, o Placar: `{ evaluator: "placar-v1", windows, minSample, retryLimitMs, recordMinN }` (`placarEvaluatorHash()`). Identifica a NOSSA regra de medida, nao um avaliador do lado do Codex; se eles quiserem outro avaliador, o hash e deles e este campo e trocado na captura |

Limites ditos: `decisionVersion` identifica o texto das perguntas e os rotulos de criterio, NAO prova o codigo que rodou (nao ha identidade de build em tempo de execucao: um hash de build entra quando o pacote compilado o fornecer); o modelo resolvido pelo provedor nao e devolvido hoje, so o nome pedido (`jev-latest`); isso fica `model: "jev-latest"` e a lacuna e dita. Nenhum valor e retrodatado: consultas antigas continuam sem envelope.

Aceite: teste do ciclo com relogio falso que avanca entre os pontos (asked, answered e recorded estritamente crescentes, factAvailable menor que asked); hash do registro bate com o texto gravado; `snapshotHash` bate com `sha256(JSON.stringify(brief))`; mudar qualquer constante de pergunta muda `decisionVersion`; sem relogio coerente (answered menor que asked) o envelope nao e escrito.

## 5. Ordem

1. V2-3 e V2-2 (status), depois V2-4, depois V2-5. Cada uma com testes primeiro.
2. Depois: fatia web W2 (corrigir os textos obsoletos da HUD, desenhar `resources` dentro de SISTEMA e as `guards`) com manifesto web novo.
3. Manifesto backend v2 e aviso ao Codex.
