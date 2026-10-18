**PASS — adequação do escopo proposto, somente.** Nenhum bloqueador adicional no texto; não constitui aprovação de implementação, ciclo, merge ou objetivo completo.

Revisor: `01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinto do implementador; nenhuma implementação própria revisada. Sol/xhigh solicitado; modelo/esforço/tier efetivos desconhecidos. Cópia exclusiva ordinária, sem sandbox OS somente leitura. CONTRIBUTING e harness aplicados; contexto da própria conversa recuperado. Origem/Git apenas lidos; somente este relatório escrito.

Baseline: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. Fontes confrontadas com blobs fixos; CRLF/LF explica diferenças físicas, sem mudança semântica. Hashes abaixo vinculam bytes efetivamente lidos.

**Findings/evidências.** `candidates.ts:269–281` ignora identidade retornada, fixa idade zero e considera entrada suficiente para custos completos. Avicenna, linhas 13–15/31–41, relata reprodução offline desses três P2 com 38 assertions. Conferi relatório/hash e correspondência estática; não executei nem verifiquei independentemente seus logs brutos. Evidência suficiente para exigir REDs G2/G3/G4/G6, não para certificar correção. Adapter atual mantém fee=null/bloqueio; `plan.ts:16/50–62` não qualifica DeFi live.

**Cobertura dos requisitos** — draft:27–34:

- G1/G5: consumidor real do cliente existente, sete famílias de leitura, paginação/proveniência; preservam D16/D19/D25 e I1.
- G2/G3/G4/G6: identidade solicitada não vira verificada; relógio local não prova freshness; custos desconhecidos não viram zero. Exigem correção também do caminho legado, hold e exclusão live; compatíveis com I3–I5.
- G7/G8: UI integrada, ausência/erro/parcialidade e origem explícitos; RED público, controles válidos, revisão independente. D9 exige evitar texto livre remoto na projeção/JEV/UI; D23 e I6–I7 continuam cumulativos.
- Preview P1–P6 permanece imutável: sem produtor, inventário fictício ou disponibilidade financeira inventada. Discovery não substitui estratégias, reconciliação I5, F5/F6 ou qualificação operacional.

**Próxima elegibilidade/limites.** Antes de congelar/iniciar ciclo, vincular API/schema, arquivos/ownership exclusivo, limites e matriz requisito→RED/GREEN; incluir wrong_chain/token, ausência/24h/futuro, entrada-only, paginação sem progresso/cursor repetido e estados UI. Resolver gate preview ou documentar separação sem enfraquecê-lo (draft:47). Sem testes, APIs, inferência, carteira ou fundos nesta revisão; documentação introdutória não comprova contrato completo, acesso ou custo.

**SHA256 verificados** (prefixos de diretório abaixo relativos à origem):

| Arquivo | SHA256 |
|---|---|
| docs/DEFI-DISCOVERY-INTEGRATION-SPEC-DRAFT-20261011.md | 24af94526888a57f734a3c8df2d8ad8f3f858b3a7d9a14117b53ce98a3f01cc3 |
| docs/research/DEFI-CANDIDATE-BOUNDARY-FINDINGS-20261011.md | 776ac985d2fc531e47124e1b08168dd42c5dd4e975d517d312cde7dc6134f27f |
| src/operator/candidates.ts | 3955e44992bba1a2a36a6382f3ad29fe50c2248300deb2646519f3c54dbdd219 |
| src/operator/risk-gate.ts | 7b916e9246c16e68cb6f007f687009f54e6237d54ae7297ce8c7a663daffbaa1 |
| src/operator/plan.ts | 488159912f83980e4e0a642aac9cf3342533fc76c1eac6df3a19c0f3b4d8d9f4 |
| src/onchainos/defi-read.ts | 23b50cc9ba14b28932601b4b6ce17e2d5731c20728db681ed598d607f5af6432 |
| docs/WEB3-INTEGRATION-DELIVERY-SPEC.md | 4ae88b6726cd0ab742c334037fc098907af0af7298d368cf374cb5cc622407ee |
| docs/OKX-ONCHAINOS-DADOS-SPEC.md | 8a0755607de629b2e927413dbe7b61537c3d534ce7693c9f0c29aba3f184ef81 |
| docs/HTTP-PREVIEW-SPEC-20261011.md | e32244822c49fe6b248eccd15da9c9addff18a1fa6c8abd97004861de7a42d2c |
| docs/research/OKX-DEFI-ENDPOINT-COVERAGE-20261011.md | 45f38a31dd56c021d5a837d2af0805fc3cf688ff73e2def9dfd0fd6315106b39 |
| docs/research/OKX-DEFI-WIRING-INDEPENDENT-REVIEW-20261011.md | 542a1cc8dcc24a80cf2466d75232b9095d3d05c35b973e313526ca31a8a054c6 |