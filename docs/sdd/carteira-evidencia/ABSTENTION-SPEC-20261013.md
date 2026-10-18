# Consulta de carteira: evidência suficiente e lacunas explícitas

Objetivo observado: a consulta real mostrada pelo usuário respondeu `abstain` para seis ativos. Melhorar a coleta e o contexto do Jev antes de alterar as recomendações. Este adendo preserva WAL-01 a WAL-06 de CONNECTIVITY-SPEC-20261013.md e os contratos canônicos; não autoriza ordens nem novas consultas privadas pagas.

## Critérios congelados

- ABS-01: reproduzir offline a perda de evidência no caminho de seis tokens, com gateway sintético identificado. O plano de carteira prioriza dados realmente consumidos, dentro do teto existente de 15 leituras. Não altera o plano do modo token para outros usuários.
- ABS-02: preservar preço, liquidez, volume e variações normalizadas disponíveis no resumo enviado ao modelo, com origem e idade. Não enviar endereço da carteira, patrimônio, preço de aquisição ou valor das posições. Valores ausentes continuam nulos. Nenhuma estratégia codificada substitui a escolha do Jev.
- ABS-03: distinguir fontes essenciais ausentes, recursos opcionais não coletados e recursos não aplicáveis. Nunca interpretar a ausência de clusters, pools, quote ou regime como prova de risco. Manter identidade, cancelamento, limite de chamadas, frescor e validação de escolhas.
- ABS-04: na UI, apresentar evidência disponível e lacunas em linguagem simples, legíveis sem reticências que escondam informações. Para abstenção, dizer que nenhuma ação foi indicada, e que a lista mostra lacunas da coleta, não uma justificativa produzida pelo modelo. Não inventar razões nem recomendar operações via código.
- ABS-05: preservar consentimento explícito e consulta por botão. Quando o modelo receber contexto de mercado público, a descrição precisa dizer isso e continuar excluindo endereço e valores das posições. Consentimento anterior não autoriza automaticamente o novo payload. Nenhuma chamada privada adicional nesta verificação.
- ABS-06: teste de regressão vermelho antes da correção, Bun testes pertinentes, typecheck e build da UI; revisão independente em cópia isolada, com hashes. Não afirmar que o Jev melhorou o resultado financeiro ou que a correção está ativa sem evidência correspondente.

## Responsabilidade e entrega mínima

Codex integra somente HoldingsConsult.tsx, HoldingsPanel.module.css e testes holdings-consult-render.test.tsx, além deste adendo e evidências. O backend src/inonu e src/onchain-read está reservado ao Claude conforme COORDENACAO-CLAUDE-20261013.md. A correção desses arquivos será preparada e testada em cópia isolada, entregue como patch e pedido ao dono, sem gravar na zona reservada. Parser web de resposta deve ser compatível com respostas anteriores.

A hipótese de prefixo de coleta e descarte de contexto é verificável no código. O screenshot prova a abstenção real, não prova sozinho que endpoints faltaram por acesso, limite ou indisponibilidade. O ensaio offline não prova cobertura real da chave OKX nem qualidade financeira.

Escolha de abordagem e seam: approved_by=jev_delegated. Recibo Jev Workflows b8449ab5-cf01-4569-b305-4f4a3115d2b4, Choice focused_evidence, confiança 0,95; 575 tokens de entrada e 63 de saída, custo desconhecido. Dados enviados: descrição técnica sanitizada, sem ativos, saldos, código privado ou endereço. O recibo é aconselhamento técnico, não autorização humana.
