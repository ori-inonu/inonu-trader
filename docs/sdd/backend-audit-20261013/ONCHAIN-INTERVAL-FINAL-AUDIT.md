# Auditoria independente final da integração Onchain

`reviewer_id=audit_intelligence`; identidade `/root/audit_intelligence`, conversa `01a13629-d057-7821-a554-a42994564eb9`. Data: 2026-10-13. Revisor distinto do implementador, sem autoria das fontes ou da SPEC. **Decisão: approve para a integração local da fatia OR-01 a OR-04 nos hashes abaixo.** Não há achado impeditivo observado nesta fatia.

## Avaliação e cobertura congelada

| Critério literal | Evidência e conclusão |
|---|---|
| OR-01, `ONCHAIN-SPEC.md:13` | `gateway.ts:102–109` conserva admissão serial, reserva após espera e contabilização do líder enviado. `gateway.test.ts:75,84,93,178` cobre seguidores, falhas, cap=1 concorrente, teto dinâmico e mês UTC. Fontes integradas iguais às revisadas independentemente. Atendido nos casos exercitados, por instância. |
| OR-02, SPEC:14 | `client.ts:213–233` revalida gates na fila e após intervalo, obtendo credenciais no despacho. `client.test.ts:42,58,163,373` cobre 402 por tier, expiração, credenciais removidas e 429/50011. Controles independentes anteriores também exercitaram retry seguido de fila. Atendido. |
| OR-03, SPEC:15 | `client.ts:90–104,143,168,188` mantém prazo compartilhado fetch/corpo/retry e barreiras a efeitos tardios. `client.test.ts:77,101,121,142` e `gateway.test.ts:45` cobrem abort ignorado, 401/403, rejeição tardia, progresso e ausência de cache tardio. Atendido nos transportes sintéticos exercitados. |
| OR-04, SPEC:16 | `client.ts:133–137` prepara RequestInit, URL e transporte antes da marca em cada tentativa; `bind(deps)` conserva o receiver. Desde a pré-imagem LIVE, somente client e seu teste mudaram: marca deslocada e cinco casos de preparo lento, sem relaxar `>=38` para intervalo 40 ms. Gateway e seu teste são idênticos. Assinatura, normalização, stale, intents mistos, retry limitado e histórico foram cobertos pelas revisões distintas, suites e tipos. Integração por hashes conferida. Atendido no escopo documentado. |

A SPEC permanece congelada. SPEC e Standards finais aprovam o mesmo candidato. Não repeti a suíte: os quatro arquivos LIVE são byte a byte iguais ao candidato que examinei e exercitei independentemente. O log integrado registra **232 pass, 0 fail, 941 expects, 12 arquivos**. O inventário e o log identificam `routes/wallet.test.ts`, acrescentado pela sessão concorrente; esse arquivo e seus testes não são atribuídos a esta mudança.

## Preservação e conformidade operacional

As quatro pré-imagens salvas têm exatamente os hashes `before` do manifesto, tanto LIVE como isoladas. Plano: quatro pré-imagens, dezoito documentos, quatro fontes; manifesto: vinte e quatro escritas efetivas, somente duas fontes alteradas. As primeiras quatro escritas são pré-imagens; plano e progresso coincidem com o manifesto. Todos os seus vinte e quatro alvos atuais batem com `after`.

O helper `integrate-onchain-interval.mjs:58–68` guarda e verifica bytes anteriores; `:71–81` verifica precondições finais, candidato, hash imediatamente anterior e hash posterior a cada escrita. Isto evidencia comparação estrita de hashes, sem lock atômico entre check e escrita. O manifesto declara corretamente `concurrentWriterLockClaim:false`. Seu `verification:pending` é o estado histórico da integração; a verificação posterior está no registro separado de 18:59:53Z, sem reescrita do manifesto.

Esta auditoria respeitou fontes e documentos somente leitura, sem Git, rede, .env, credenciais, modelos, ordens ou gestão de processos. Escrevi apenas artefatos do prefixo exclusivo em `research`. Hashes antes/depois das quatro fontes permanecem iguais. As rejeições anteriores continuam intactas (`77d3139a…` SPEC e `3f68fac4…` Standards); o desvio Git da revisão histórica conserva sua limitação operacional, sem aprovação retroativa. A aprovação operacional é restrita às ações e evidências desta auditoria e da integração observada, não ao histórico integral.

## Limites

Temporizadores JavaScript são cooperativos; bloqueio síncrono, suspensão e mudanças do relógio de parede impedem uma garantia temporal rígida. O retry permanece limitado dentro da mesma vaga documentada em `client.ts:2–8`; não se certifica um novo gate entre suas tentativas internas. Os getters sintéticos não estabelecem a causa exata da falha LIVE histórica. Timeout limita a operação enviada, não a coleta total nem alocação por streaming (SPEC:29). Não certifico credenciais, provedor real, carteira, 300 ms, negociação, ganho financeiro, ML, objetivo amplo ou futuros hashes.

## Anexo: hashes exatos

| Fonte, igual LIVE/isolada e antes/depois desta auditoria | SHA256 final |
|---|---|
| `src/onchain-read/client.ts` | `35b8862b67d448e4eb104fb5353825d95839e311c62d92e127ac17367aa08e93` |
| `src/onchain-read/client.test.ts` | `6b57c61efe134aec6d7b7f9afbb06c1b67c85ca36b483405547f0ba97efa6c65` |
| `src/onchain-read/gateway.ts` | `62b3a8110719f4896d7b08a8da86e6f71080c25fa76e26b0451db7c62f59be42` |
| `src/onchain-read/gateway.test.ts` | `9ad74d46714a5747432ffc812e8dab39c5f0f652aa02b5da304a4d006da61648` |

Pré-imagens em `docs/sdd/backend-audit-20261013/evidence/onchain-interval-preintegration/src/onchain-read/*.txt`: client `7f48c71f45b317482325eb506626c8dbe930e3f50827b81a851f7d5d67fd1138`; client.test `3dbb7c31fc14ffd71b2bb2c5f2378e404fc54f85bd0dd3ba786a55e943f3c958`; gateway e gateway.test iguais aos hashes finais acima.

Documentos examinados em `C:/Users/gabri/jev-trader/docs/sdd/backend-audit-20261013`, iguais na cópia `implementation`:

| Alvo | SHA256 |
|---|---|
| `ONCHAIN-SPEC.md` | `4ef3aadfbb0baec1c9fdd4fb262312fd425864d53718abad9d9ba6fe94735ec3` |
| `ONCHAIN-INTERVAL-FINAL-SPEC-REVIEW.md` | `5365177a0a465a229778fd29358ece232076cc360aacbd6026a99af7d648ada9` |
| `ONCHAIN-INTERVAL-FINAL-STANDARDS-REVIEW.md` | `1f2e821757e8abfae4b330fa7c38e2bd3b257bf85ee15ff188f4a33cc45e16db` |
| `evidence/onchain-interval-integration-manifest.json` | `d2dcf7c6283def98ec9019f1a6314d5524f06ceb7afc72f27fc58aa6306732f7` |
| `ONCHAIN-INTERVAL-FINAL-LIVE-VERIFICATION.md` | `4039245af4c7067e71bd2c72dff0fbbf606374be60ec62df99654a8e03eca380` |
| `evidence/onchain-interval-final-live.json` | `e5e25048babcd8455576851eef10efbe52f9d32b46502e2d8f4377abefb224e4` |

Helper `44068c73136d3820f7135f148c99ed170e061d988011f88b635491d4ae7c5e17`; plano `524dea78a07b91dcd0a5bc6662e47f5369df32cbe990e10bda9514cdf0e2c05a`; progresso `37721212c19015c4f2611d8e21f2ca8f1c17bb296906b9601980384f460e6f98`.

## Anexo: logs, métricas e proveniência

Logs/métricas fornecidos foram lidos e conferidos contra `onchain-interval-final-live.json`, LIVE, `implementation` e os originais em `verification` do taskRoot. Todos os hashes coincidem. Não executei testes nem typecheck novamente. Os exits 0 são os observados no commandExecution nativo informado pelo coordenador e registrados na verificação fornecida; as métricas RTK não contêm exit code. Saída vazia sozinha não foi usada para inferi-lo.

| Execução integrada fornecida | Saída literal do log | SHA256 log / métricas |
|---|---|---|
| testes | `232 pass`, `0 fail`, `941 expect() calls`, `Ran 232 tests across 12 files. [2.44s]` | `1a3ce4de6c96c21dd4bdbc4827b12720fd0c7c2c1bfaf9f5d6552476b4951e10` / `dde62ad39af83e8a078463c9c8dc39f4e21dfb99ae9b059b629e36be2d494fab` |
| tipos estritos dos quatro alvos | 0 bytes | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` / `28a75af4e899c310daaf6f4195ab0a0bcb7f43fae042161ea68acf885f35d512` |
| tipos globais no instante registrado | `$ tsc --noEmit -p tsconfig.verification.json`, 46 bytes | `27c1f71f1597c81ed3a1974cc8ece11a676a1665e53368561f671be9728bc324` / `a528d9ea3746769e15d08e7b0926e6f5b1292f4eb224973e6e0e753c965475ef` |

RTK `0.51.0`, Headroom `0.40.0`, `pass_reason=command_not_allowlisted`, `archive_id=null`: bytes passam sem compressão. Métricas preservam stdout/stderr separados; logs fornecidos são capturas combinadas, portanto seus hashes não são os hashes individuais das métricas. A suíte anterior rejeitada e seu resultado de falha continuam preservados.

Comandos reais desta auditoria: PowerShell `Get-Content`, `Get-FileHash -Algorithm SHA256`, `Select-String` e inventário delimitado; inspector exclusivo Python `pathlib/hashlib/json/difflib`, executado pelo Python instalado em `C:/Users/gabri/.codex/tools/rtk-headroom-20261010/venv/Scripts/python.exe`. As execuções de leitura e inspector encerraram com exit 0. Comparações literais das quatro pré-imagens com LIVE constam no JSON exclusivo, sem Git.

Artefatos exclusivos em `C:/Users/gabri/.codex/tmp/backend-01a1361d-v2/research`:

- [Evidência completa](onchain-interval-final-integration-audit-evidence.json): `a29d779565653fa767b262d8da15bb9083c439a93453b3b9b97f6643b33c0140`.
- [Hashes antes](onchain-interval-final-integration-audit-before-hashes.json): `9dee2c24c08ada01387c352b35269dfb624a11f12018c87f571dee7626d58fdd`.
- [Hashes depois](onchain-interval-final-integration-audit-after-hashes.json): `2bcefc888c3f706878ffed212992519e0a0953b3fe419b7044ae0cada18017e5`.
- [Inspector somente leitura das entradas](onchain-interval-final-integration-audit-inspect.py): `648b023de9180defe313999e4dfc38b935da9dc508831aab67ede435ae219da2`.

Este parecer fornece evidência ao gate local; não concede autorização humana ou externa e não reclassifica eventos históricos.