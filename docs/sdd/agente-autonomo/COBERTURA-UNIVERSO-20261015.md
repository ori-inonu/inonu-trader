# Cobertura do universo de tokens: o que o agente le hoje, por rede (2026-10-15)

Pedido: Codex 187 item 1 e 189 (o dono quer acompanhar os criptoativos da rede; cada fonte deve declarar redes e contratos que consegue enumerar, denominador, paginacao ou cursor, idade, cobertura e exclusoes; sem denominador completo a cobertura e declarada parcial, nunca "todos os ativos"). Este documento e um INVENTARIO feito so por leitura do codigo (`src/inonu/source-ecosystem.ts`, `src/inonu/onchain-plan.ts`, `src/agent/wire.ts`) e dos dados que o agente ja gravou. Nao chamei nenhuma API, nao usei credencial, nao mudei codigo nem o agente vivo.

## 1. O que a fonte le (por rede)

| Item | Valor no codigo | Onde |
| --- | --- | --- |
| Redes lidas quando ninguem escolhe | `501` (Solana), `8453` (Base), `56` (BNB Chain), `1` (Ethereum) | `DEFAULT_ECOSYSTEM_CHAINS` |
| Maximo de redes por leitura | 4 | `ECOSYSTEM_MAX_CHAINS` |
| Lista de mercado por rede | `/onchain/hot-tokens`, `timeFrame` "4", `limit` 100 | `source-ecosystem.ts`, leitura 1 |
| Carteiras rastreadas por rede | `/onchain/signals`, `walletType` "1,2,3", `limit` 100 | idem |
| Leituras de risco | as 6 primeiras do ranking (ate `candidatos + 2`, no maximo 14, quando o agente pede mais candidatos) | `RISK_READS` |
| Candidatos oferecidos | 5 por padrao no clique; o agente pede 10 (`AGENT_POOL`), ate 12 | `ECOSYSTEM_CANDIDATES`, `ECOSYSTEM_MAX_CANDIDATES`, `AGENT_POOL` em `src/agent/live.ts` |
| Teto de chamadas OnchainOS por plano | 15 | `MAX_ONCHAIN_CALLS` |
| Redes lidas pelo agente | as redes em que o agente tem caixa (`saldo.chains` com caixa maior que zero, maior caixa primeiro), senao as 4 padrao; quando esse conjunto muda o scan e refeito apos 2 min | `cashChains` e `REFRESH_ON_NEW_CHAINS_MS` em `live.ts` |
| Reuso do scan pelo agente | 30 minutos (`baseTtl`); 5 minutos enquanto o gancho `hot` esta ativo (compra aberta ou nivel de risco que abriria uma; `hotTtlMs: 5 * 60_000` em `wire.ts`); scan que falha serve o ultimo por ate 2 horas e depois nada | `createEcosystemReader` em `live.ts` |

## 2. Cobertura: PARCIAL, e por que

- Universo conhecido por rede: NAO HA denominador. A fonte devolve no maximo 100 linhas por rede e por lista, ordenadas pelo provedor; o codigo nao recebe o total de tokens da rede, nem cursor para ir alem dos 100. Fonte primaria citada pela Codex (nota 187): a paginacao do Hot Tokens nao e profunda alem desses cem. Portanto a leitura e uma amostra de popularidade, nao um indice da cadeia, e a cobertura e **cobertura parcial** em todas as redes.
- Quantidade varrida por rede: ate 100 de mercado mais ate 100 de carteiras rastreadas; cada leitura que falha vira nota ("faltou a rede"), nunca zero (`missing` no codigo).
- Rotacao entre redes: nao ha rotacao propria; as redes lidas seguem o caixa (ou as 4 padrao). Com o teto de 15 chamadas por plano, 2 chamadas por rede e as de risco competem pela mesma cota; se a cota acaba, as redes restantes ficam em `missing`.
- Escopo do dono (nota de 2026-10-15 em `capacidades-okx.md`): spot, so Solana por enquanto. As outras tres redes do padrao nao devem ser tratadas como cobertura contratada.

## 3. Idade dos dados

A fonte registra por rede a idade de cada leitura (`sourceByChain`: idade em ms e se estava velha, para a lista quente e para as carteiras). O agente reutiliza o scan por ate 30 minutos em tempo normal e por ate 5 minutos enquanto o gancho `hot` esta ativo (e por ate 2 horas se os scans novos falham), ou seja, os candidatos que o Jev ve a cada 2 minutos podem ter ate 30 minutos de idade; isso e uma razao a mais para a decisao por evento material pedida na 187 item 5. Um valor de cache lido de novo nao e descoberta nova: a idade registrada e a que decide, e o codigo nao a apresenta como tempo real.

## 4. Exclusoes que o codigo ja conta

`excluded` por motivo: `pool_ou_detentores` (nao entra pelas regras de entrada), `pouco_apoio` (menos de duas familias de evidencia), `honeypot` (nunca oferecido). Um token sem leitura de risco nao reivindica a familia "seguranca" para passar na frente dos checados.

## 5. O que se mediu localmente (Solana, sem inventar universo)

Nas ultimas 120 consultas guardadas em `briefs.jsonl`, 25 tokens distintos de Solana apareceram como compra oferecida (731 ofertas puladas). Isso descreve o que chegou ao Jev, NAO o tamanho do universo da cadeia.

## 6. O que falta e o experimento mais proximo

1. Denominador por rede: o catalogo gratuito de redes suportadas exige a credencial do dono e eu nao a usei; fica pendente de uma leitura autorizada (o dono ou a Codex). Mesmo com o catalogo de redes, ele nao daria o total de tokens por rede.
2. Cobertura mais ampla e barata sem prometer "todos": rodada rotativa entre redes e paginas (varredura larga com cache) separada do enriquecimento fundo dos melhores, reutilizando as leituras que o Radar ja faz. E mudanca em `src/inonu` e `src/agent`, entao depende da passagem coordenada com a Codex.
3. Teste proposto, em sombra e sem tocar o vivo: contar, por rede, quantos tokens distintos a fonte entrega ao longo de um dia e quantos deles viram candidato, para medir a rotatividade do topo de 100 (uma lista que muda pouco cobre pouco).

Estado: inventario por leitura; nada carregado, nada ao vivo, sem ganho medido.
