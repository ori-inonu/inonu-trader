# Plano de evolução do frontend

Entrega de análise, especificação e plano, em 13/10/2026. O produto não foi alterado por esta tarefa. O objetivo é tornar a interface financeira mais clara, acessível e consistente, com otimizações escolhidas a partir de medição.

Comece por [tasks.md](tasks.md), consulte [audit.md](audit.md) para as evidências e use [requirements.md](requirements.md) e [design.md](design.md) como contrato de implementação. [acceptance.md](acceptance.md) contém a aceitação congelada desta entrega documental, distinta dos testes futuros do produto.

## Direção escolhida

1. Corrigir clareza de modo, origem e associação entre decisão, preço e execução.
2. Corrigir teclado, relações entre abas e respostas fora de ordem.
3. Organizar desktop/mobile segundo a dieta de informação existente.
4. Medir o frontend em build de produção e otimizar somente custos demonstrados.

Preservar a identidade Inonu na Mesa e a atribuição explícita a Jev. Compartilhar primitivas de apresentação, mantendo separados os contextos CEX/onchain, desktop instalado e demonstração Jev/Kuru. Jev recomendou essa arquitetura e a sequência acima; recibo real sanitizado em [decisions.json](decisions.json), com `approved_by=jev_delegated`, sem aprovação humana inventada.

## Evidência e limites

- Inventário completo de 1.091 arquivos não ocultos em docs, 477 Markdown, mais hashes da fonte web: [inventory.json](inventory.json). Inventário não equivale à leitura integral de cada arquivo. A cobertura semântica e as divergências constam na auditoria e no relatório documental.
- Capturas atuais do público e de uma cópia local isolada: [public-observation.json](public-observation.json), [local-observation.json](local-observation.json) e imagens associadas. A cópia local foi executada sem arquivos de ambiente e sem backend, somente para leitura de UI. O build publicado não foi identificado por commit.
- Não houve medição de performance, validação integral WCAG, teste de wallet, ordem, deploy, commit ou staging. Não há ganho atual certificado nem comprovação de execução financeira real nesta entrega.
- O plano protege as reservas da [carteira canônica](../carteira-evidencia/tasks.md), do [desktop](../inonu-desktop-v1/OWNERSHIP.md) e das entregas concorrentes Mesa/Inteligência/Quant, identificadas em [docs-revalidation.md](docs-revalidation.md). [frontend-revalidation.md](frontend-revalidation.md) separa correção já presente de lacunas ainda abertas. Critérios antigos em conflito devem ser reconciliados com rastreabilidade antes de mudar componentes compartilhados.

O primeiro slice recomendado é T02, teclado da busca de ativos e das tabelas, depois do gate de ownership T00. É concreto, tem gatilhos conhecidos e pode ser verificado sem tocar no executor financeiro.
