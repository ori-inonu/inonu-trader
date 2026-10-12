# Contraste dos tokens do painel de integração

Recorte: `RealPipeline.module.css` e seus tokens em `globals.css`, vinculados à fonte r8c. Cálculo reproduzível e hashes em CONTRAST-SOURCE-R8.json. Esta é uma verificação de fonte, não uma certificação integral de acessibilidade ou de G14.

Treze combinações de texto, foco e borda de erro passaram nos limites aplicáveis; a menor razão calculada foi 7,158626317689398:1. Comparações usam a razão não arredondada. Texto base/secundário, badge hold, dependência, consentimento, proveniência e botões foram comparados aos fundos declarados; foco e erro foram comparados a seus fundos adjacentes.

Os limites de referência são 4,5:1 para texto normal ([W3C SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)) e 3:1 para informação visual necessária e foco ([W3C SC 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)). Bordas estruturais decorativas não foram tratadas como único identificador de controle. O estado dos controles nativos e todos os valores computados/herdados ainda exigem verificação servida completa.

A referência de 44×44 CSS px é SC 2.5.5 nível AAA na WCAG 2.1 ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)); ela não deve ser apresentada como certificação AA. O requisito próprio de alvos confortáveis do projeto permanece. Toque físico, leitor de tela, zoom de 200% e preferência reduced motion alterada em runtime não foram exercitados por esta verificação. G14 continua parcial.

Decisão de realizar este recorte: CONTRAST-AUDIT-DECISION.json, recibo real 7b37bf2c-a9ac-4a31-bc34-71df6cc775d1, fonte Jev consultiva, `approved_by=jev_delegated`, `human_response=false`, custo faturado desconhecido.
