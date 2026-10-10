# Emenda candidata ao contrato DEX V2

Data: 9 de outubro de 2026. Estado: **rascunho versionado, não congelado e não implementado**. Esta emenda não altera nem substitui silenciosamente a SPEC congelada `OKX-DEX-V2-SPEC.md`, SHA-256 `b6cdb5629a1899e22d7d54f0461d75fa4d56fd4a16284ce872f271981d2f469b`, nem o registro `OKX-DEX-V2-FREEZE.json`.

## Problema observado

A captura oficial consultada documenta o `amount` da requisição como unidades mínimas do token. A resposta lista `toTokenAmount:string`, mas não explicita a unidade desse campo. O contrato local registrou essa diferença como inferência. O candidato atual ainda usa a saída da primeira quote como entrada da segunda e expõe campos `outputAtomic` e `quotedGrossDeltaAtomic`, mesmo incluindo `quoted_output_unit_inferred` entre as razões. Isso não sustenta um delta atômico ou uma composição dimensionalmente validada.

A mesma auditoria pede que a assinatura seja amarrada aos bytes exatos do path/query efetivamente enviados e que o timestamp assinado corresponda ao header enviado. A frase "zero egress de segredo" também precisa distinguir o segredo HMAC local da API key/passphrase necessárias ao protocolo autenticado.

Fonte local capturada: `docs/OKX-DEX-QUOTE-CONTRACT-20261009.md`, SHA-256 congelado `4ce9b26ed0dd15e6cb52bd8057f0a6f9186a2ad7f8c970e81a984817febe87cb`. A ausência de uma unidade na captura consultada significa desconhecida; não prova que o serviço nunca a documentará.

## Política proposta

1. **D2-UNIT-1: quote isolada.** Até a semântica da unidade de resposta ser documentada por fonte oficial suficiente, o caminho permitido é no máximo uma quote read-only. A resposta pode preservar a string original como `providerOutputAmountRaw`, com unidade `unknown`; não converter, normalizar, somar, subtrair ou comparar esse valor como quantidade atômica.
2. **D2-UNIT-2: sem dependência dimensional.** Enquanto a unidade estiver desconhecida, não usar `toTokenAmount` como `amount` de uma segunda requisição ou como entrada de economia/candidato. Não emitir `outputAtomic`, `quotedGrossDeltaAtomic`, round-trip delta, lucro bruto ou net. Uma resposta de quote não qualifica execução.
3. **D2-UNIT-3: promoção futura.** Uma composição A→B→A só pode ser especificada numa revisão posterior quando evidência oficial declarar unidade de entrada e saída compatíveis e os testes validarem cada direção. Evidência inferida, fixture, resposta Jev ou captura sintética não satisfaz este requisito.
4. **D1-SIGN-1: bytes assinados e enviados.** A string de path e query usada na assinatura deve ser idêntica, byte por byte, ao path/query da requisição transmitida. Construir uma única representação canônica e não reserializar/reordenar entre assinatura e envio.
5. **D1-SIGN-2: timestamp.** O valor UTC assinado deve ser exatamente o valor colocado no header de autenticação daquela mesma requisição. Desvio, ausência, parse inválido ou troca depois da assinatura falha antes do fetch.
6. **D1-SIGN-3: origem fixa.** Manter HTTPS e origem OKX fixa, sem seguir redirects para outra origem. Nenhum dado de wallet, endereço/saldo pessoal, API response bruto ou segredo é enviado ao JEV.
7. **D6-CREDENTIAL-1: egress explícito.** `secret` HMAC permanece apenas no processo e nunca é transmitido. `apiKey` e `passphrase` só podem ser enviados nos headers de autenticação à origem OKX fixa. Nenhuma credencial pode aparecer em URL/query, redirects, logs, exceções, relatórios, fixtures ou payload JEV.
8. **D4-NET-1: net permanece desconhecido.** Não estimar custo total nem retorno líquido a partir de uma quote isolada. Fees e custos incompletos permanecem `null`/`unknown`; não subtrair duas vezes valores sem cobertura demonstrada.

## Aceitação observável

- Se a resposta contiver `toTokenAmount` mas sua unidade permanecer sem suporte documental, a saída preserva apenas o valor bruto opaco, identifica unidade desconhecida e não faz segunda chamada dependente.
- Se qualquer consumidor tentar tratar esse valor como atomic, o gate bloqueia antes de cálculo ou nova chamada.
- Se o path/query transmitidos diferirem dos bytes assinados, o teste falha e nenhum fetch ocorre.
- Se o timestamp do header diferir do timestamp assinado, o teste falha e nenhum fetch ocorre.
- Redirect, origem diferente, segredo na requisição enviada, credencial em log/output ou qualquer envio de estado privado ao JEV falha nos testes.
- Fixtures permanecem explicitamente sintéticas e não qualificam resposta live, unidade do provedor, custos, quota, preço fresco, retorno ou execução.
- A SPEC congelada D1-D8, seu hash e o resultado de revisão independente anterior permanecem imutáveis; qualquer adoção desta emenda exige um novo freeze, manifesto e revisão de SPEC antes de implementação.

## Decisão Jev advisory

Uma Choice real via `hermes jev evaluate --file` selecionou `single_leg_raw_only` com confiança `0.79` e probabilidades `0.86` / `0.10` / `0.04`; backend TypeSafe, modelo `jev-1.13.0`, uso 648/50 tokens. Significa preservar no futuro uma única resposta como dado opaco, sem segunda quote dependente nem aritmética atômica. A evidência está em `docs/evidence/okx-dex-unit-policy-jev-20261009.json`. O CLI não retornou receipt ID; persistência da receipt e custo cobrado são desconhecidos. A decisão é advisory, `human_response=false`, `execution_authorized=false`; não autoriza query live nem operação financeira.

## Fora de escopo

Sem consulta live, wallet, signer, allowance, approval, swap, ordem, broadcast, transferência, pagamento, posição ou alegação de lucro. Sem alteração ao freeze existente. Nenhuma implementação é aprovada por este rascunho ou pela resposta Jev.
