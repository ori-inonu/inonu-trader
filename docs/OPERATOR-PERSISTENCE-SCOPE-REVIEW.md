# Re-review independente de escopo — 2026-10-11

**Verdict: APPROVE exclusivamente a adequação da proposta P1–P5.** Nenhuma implementação, teste, ciclo, objetivo completo ou merge aprovado.

Thread revisora `01a12ada-91d7-7ce0-b6ea-e1556d234224`, distinta do implementador `01a12971-f941-7e42-8a42-fab6d44d4eb5`; sem autoria do candidato. GPT6.1Sol/xhigh solicitado; modelo/esforço/tier efetivos desconhecidos. Cópia exclusiva ordinária, sem sandbox RO. Baseline informado `4fe00c9fdbd01f2c9ef2d1933f79a3cd46d7d06b`, sem Git para comprovar nesta cópia.

**P1–P5 e restrições de implementação**

- **P1, SPEC:15:** API síncrona preservada; quatro tentativas significam uma inicial e até três retries, com esperas de 10/20/40 ms somente após falhas elegíveis Windows. Retornar após sucesso; nenhum retry para outros códigos/plataformas. Os 70 ms excluem latência de syscalls. É decisão arquitetural proposta, não resultado experimental. Receipt citado:11 permanece consultivo; não reauditei recibo privado.
- **P2, :16:** reutilizar temporário completo; repetir apenas rename. Não repetir serialization/write, execução do operador ou chamadas financeiras; preservar destino anterior e erro no esgotamento. Compatível com ledger.ts:229–236.
- **P3, :17:** lstat deve distinguir diretórios/links reconhecidos e ausência ENOENT de falhas de metadados. EPERM isolado não comprova transitoriedade (experimento:25). Nenhum erro de metadados deve entrar inadvertidamente no retry de rename. Exclusões de durabilidade e detecção abrangente de reparse estão explícitas.
- **P4, :18:** cobertura futura deve demonstrar também links reconhecidos, metadados desconhecidos/não ENOENT, códigos permitidos, código desconhecido e ramo não Windows e parada imediata no sucesso. Controle real precisa liberar leitor por outro processo/worker durante espera síncrona; timer no mesmo event loop não serve. Preservar assertions de storage/STOP/expiry/identidade/reconciliação; demonstrar contagens sem sends adicionais e expiração durante espera (executor.ts:199–203; approval-identity.test.ts:394–411).
- **P5, :19:** logs exatos, hashes finais e revisões independentes exigidos; falhas globais permanecem registradas. A aprovação de escopo não satisfaz esses gates futuros.

**Achados:** nenhum bloqueio na adequação do draft fornecido; nenhuma correção obrigatória de critérios. Observações acima concretizam a verificação dos critérios existentes, sem enfraquecê-los. CONTRIBUTING conferido. A ausência documental do parecer anterior foi resolvida; aquele parecer permanece intacto.

**SHA256 verificados**

- SPEC: `1aa0ea1667e8e1f46a82c1636cb0824df6b265fb16eb9d9e4ad3bbf5e7bf869a`
- ledger.ts: `e1e6db9de5de1305e6d129387acd34b867b4b3df8d9d31eff168b3898bd21a7a`
- executor.ts: `17db3012332584dce46ac712e0d48ebf71f59f13533ce40d8b12fa6667b6961a`
- approval-identity.test.ts: `dfba6c5a6fe4102c394a6ad638e2ad9f65b4db983b22cfc6eaa50a22fa683681`
- persistence-experiment.md: `28daee20fb5b5d48b63f5c68808dbd62b14ee6c2f5c66b1d21e043bb59ead71d`
- Dez stdout JSONs: `33e07e46ac1efa35c542703ee613c8a0600e244b731bb375778f2fe6d555fa5f` — UTF8(`nome=sha256`+LF), nomes ordenados, LF final.
- Parecer anterior: `23d3256ffe9084448f7803d0b62f1d6bd8507f2682e49ba903a5a64ef2255a68`

Nenhum teste executado, candidato/SPEC alterado, rede/API/fundos/env/home acessado. Causa original EPERM desconhecida; sem global pass. C5 aguarda auditoria; demais partes C6 pendentes. Objetivo central JEV/M1–M4 preservados; nenhum ciclo iniciado.
