# Preflight independente da SPEC Onchain read

Identidade: `audit_okx` (`/root/audit_okx`), conversa própria `01a13629-5b7c-7bf0-82c5-38d1b3b67c07`. Data: 2026-10-13. Decisão atual: **approve para o preflight da SPEC**, com PF-01 resolvido documentalmente na revisão de hash `4EF3AADFBB0BAEC1C9FDD4FB262312FD425864D53718ABAD9D9BA6FE94735EC3`. O parecer anterior era limited. Esta revisão avalia uma SPEC preparada pelo integrador, sem editar ou certificar implementação.

OR-01/02/03 correspondem aos defeitos reproduzidos OKX-01/02/03: concorrência ultrapassa teto local, gates são consultados antes da fila e o timer termina antes da leitura do corpo. Os critérios têm resultados observáveis, distinguem envio de recusa e mantêm timeout da operação separado do prazo total da coleta. A restrição a quatro arquivos, ledger preservado, revisão isolada e integração por hashes é adequada. Não há autorização externa nem prova live.

## PF-01 resolvido e precisão dos testes

**PF-01: preservar admissão por intent antes de compartilhar uma recusa.** O plano anterior em `ONCHAIN-SPEC.md:21` movia a admissão para o líder após coalescing, mas a chave original em `baseline/src/onchain-read/gateway.ts:83` não contém intent. O contrato ONC-4 (`config-onchain-smartmoney/spec.md:45`) permite usuário durante bloqueio de ritmo diário. Hoje cada caller consulta budget antes de coalescing (`gateway.ts:91-94`); `budget.ts:161` recusa apenas background. Um líder background aguardando serialização não pode fazer um follower user permitido herdar sua recusa. A reprodução abaixo confirma o comportamento original.

A nova OR-04 (`ONCHAIN-SPEC.md:16`) fixa explicitamente mesma chave e intents distintos, incluindo background que fica bloqueado enquanto espera e user já seguidor. Exige background sem envio/contagem, user elegível preservado e um envio compartilhado quando ambos são permitidos. O plano atualizado (`:21`) mantém precheck por caller, serializa admissão final/contabilização do líder e permite uma única nova tentativa ao user que compartilhou recusa de ritmo. Esses critérios fecham PF-01 de forma verificável sem exigir alteração da API de budget, do ledger ou dos arquivos reservados. A implementação ainda precisa provar que a nova tentativa revalida orçamento e respeita OR-01.

**Precisões para os critérios já existentes:** (a) OR-01 (`:13`) agora exige literalmente "Revalidar teto dinâmico e mês UTC depois de aguardar admissão"; os testes devem incluir redução de cap durante a fila e passagem do mês UTC, pois `budget.ts:157-165` usa relógio e caps dinâmicos. (b) OR-03 deve verificar fetch tardio e corpo tardio, sucesso e rejeição: nenhuma alteração tardia de cooldown, bloqueio de camada, clock offset, lastCode/lastCall ou cache, e a próxima operação precisa concluir. São manifestações verificáveis do critério já explícito de não modificar status/cache após timeout, não novas funcionalidades.

OR-02 já explicita renovação de credenciais após intervalo, isolamento da camada 402 e recuperação após expiração. OR-03 preserva um único prazo para retry de relógio. OR-04 deve conservar assinatura exata, separação das formas internas/públicas (`gateway.ts:81-83`), janela stale (`cache.ts:31-33`) e resposta fechada ONC-5, sem conteúdo bruto do provedor. O relatório OKX já contém fontes oficiais; não houve nova consulta externa nesta revisão.

Li também o recibo local `implementation/docs/sdd/backend-audit-20261013/evidence/onchain-intent-decision.json`: `authority=advisory_only`, `receiptId=19f004c3-9bb5-4c76-9038-d07284897967`, recomendação `option_a`, modelo `jev-1.13.0`, confiança 0.68, probabilidade 0.76, uso 524/55 tokens e `billedCost=null`. Esses valores coincidem com a SPEC. O recibo registra a decisão do integrador; não fornece autorização, prova de correção ou verificação live. Minha conclusão decorre dos contratos e critérios revisados. Não executei consulta Jev.

## Evidência offline literal

Executado no diretório `baseline` com `bun --no-env-file -e $reviewCode`, exit 0. O probe usa o gateway e cache originais; client e budget são portas explícitas em memória, sem importar a implementação de budget, ler credencial, tocar ledger ou chamar fetch. Não é um teste de integração do provedor.

```ts
import { createOnchainGateway } from "./src/onchain-read/gateway.ts";
import { createOnchainCache } from "./src/onchain-read/cache.ts";
let sends = 0, records = 0;
const budget = {
  reserve: (_tier, intent) => intent === "background" ? { ok: false, reason: "pace_limited" } : { ok: true },
  record: () => { records += 1; },
  snapshot: () => ({ month: "2026-10", today: "2026-10-13", layers: {} }),
  flush: async () => {},
};
const client = {
  call: async () => { sends += 1; return { ok: false, error: "provider_error", sent: true }; },
  status: () => ({ lastCall: null, lastCode: null, cooldownUntil: 0, clockOffsetMs: 0 }),
};
const gateway = createOnchainGateway({ client, cache: createOnchainCache(() => 1000), budget, credentialsState: () => "complete", now: () => 1000 });
const params = { chainIndex: "1", token: "0x0000000000000000000000000000000000000001" };
const [background, user] = await Promise.all([
  gateway.callInternal("/onchain/price", params, "background"),
  gateway.callInternal("/onchain/price", params, "user"),
]);
console.log(JSON.stringify({ case: "baseline_mixed_intent_same_key", sends, records, background, user }));
```

Saída exata:

```json
{"case":"baseline_mixed_intent_same_key","sends":1,"records":1,"background":{"ok":false,"error":"pace_limited","sent":false},"user":{"ok":false,"error":"provider_error","sent":true}}
```

Não executei suite ou typecheck nesta fase sem código candidato. Verificação posterior deve exercitar os quatro arquivos, HTTP e tipos afetados com `bun --no-env-file`, preservando o registro dos erros externos conhecidos. Não certifiquei hashes do live: a coincidência de ownership foi informada pelo coordenador; confirmei as fontes isoladas abaixo.

## Anexo de identidade das fontes

Raiz `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/`. Hashes SHA-256 lidos por `Get-FileHash -Algorithm SHA256 -LiteralPath <arquivo>`, exit 0. Leituras delimitadas com `Get-Content -LiteralPath` e numeração de linhas, exit 0. Uma primeira formatação PowerShell dos hashes falhou com `An empty pipe element is not allowed`; a execução corrigida produziu estes valores, sem mutação.

| Arquivo relativo à raiz | SHA-256 |
| --- | --- |
| implementation/docs/sdd/backend-audit-20261013/ONCHAIN-SPEC.md, versão revisada atual | 4EF3AADFBB0BAEC1C9FDD4FB262312FD425864D53718ABAD9D9BA6FE94735EC3 |
| ONCHAIN-SPEC.md, versão anterior avaliada como limited | 8F1E395FB7CAB29127710A23B3E0A6C167D476555B077B18B571B65278E3595F |
| implementation/docs/sdd/backend-audit-20261013/evidence/onchain-intent-decision.json | 401CB8FD72C2D946B4F61BDD9B93FAFFC226DB9111EAFE1EBDD33E320805C50C |
| research/okx-audit.md | 0BB76CE2455DCBB4063DD14623B3F6A0E43AE7BC2BAF083A156173A2D91D386D |
| baseline/src/onchain-read/client.ts | 118B8E32651986E57A83876CF84F75DA533B8A6425B7F5F05F3B69379ADBD1EA |
| baseline/src/onchain-read/client.test.ts | C1C5CEE59E4498268EF6788E1F7B75CDDAE73D84C04EC42344EE7F80C66434E6 |
| baseline/src/onchain-read/gateway.ts | 0B4CE61C93037D9319913DDBAAA92D5D5892FFE33BFE7317177CD16F7EA95D0D |
| baseline/src/onchain-read/gateway.test.ts | AEF810C529C376C58C36BF4D6938CE722BC567D656C97FF5CED74076BB3C3374 |
| baseline/src/onchain-read/budget.ts | 1DC6100A2BED1F0D8F5A5B5F5EECE8EAD23118DCD0F7BBA23C1C4F408871879D |
| baseline/src/onchain-read/cache.ts | CB08989F26FF4F1EE9D4EB8CD29C556BC8E680AF3ED205775F95823A5FD0B6D0 |
| baseline/docs/sdd/config-onchain-smartmoney/spec.md | B4660C1D16EE297AC4C4D964B5336FD52A0D8606AC71411BD81E7D6CA4890B2B |

Releitura da SPEC e recibo local na segunda passagem: `Get-FileHash -Algorithm SHA256 -LiteralPath` e `Get-Content -LiteralPath`, ambos exit 0, hashes atuais acima. Apenas este relatório foi atualizado.

Próximo passo prioritário: implementar e executar as regressões sob a SPEC congelada acima nos quatro arquivos exclusivos, começando pelos casos reproduzidos e pelo caso PF-01. A revisão independente do candidato continua necessária; este approve qualifica somente a suficiência do preflight documental.
