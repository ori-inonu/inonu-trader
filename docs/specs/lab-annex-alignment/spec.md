# Spec: contratos do laboratorio nos caminhos por pasta

Estado: implementacao, regressao, verificacao completa e revisao concluidas; publicada no PR 5 em rascunho, commit aeba0f8. Fatia C2a de remaining-system-alignment. Nao conclui a reorganizacao documental integral.

Os leitores propostos em goal1 calculam indices antes de normalizar CRLF. Seus anexos preservam a4a9ef5, mas main tem atualizacoes posteriores de HAC e do mapa de prompts. A integracao deve usar os contratos atuais e preservar as referencias existentes durante a transicao.

## Aceitacao

- A1: src/lab/docs/spec.md e src/lab-jev/docs/spec.md contem os contratos atuais de main; prosa e formulas permanecem equivalentes apos a normalizacao tipografica exigida. Links relativos continuam apontando aos mesmos documentos, usando os novos caminhos para o par migrado.
- A2: um extrator de texto compartilhado pelos dois testes de pureza preserva o anexo inteiro com LF e CRLF. Marcador ausente produz recusa explicita.
- A3: regressao reproduz o extrator proposto antes da correcao, e passa depois. A suite usa os novos anexos.
- A4: os documentos antigos continuam intactos enquanto outros consumidores e referencias nao forem revisados. Nenhuma mudanca na origem goal1.
- A5: typecheck, test, test:lab, diff check e cerebro verify passam. Sem mudancas em fontes de runtime, dependencias, ambiente, limite, credencial, journal ou operacao financeira.

## Decisao limitada

Pergunta: como integrar estes dois contratos sem perder correcoes de main? Opcoes: usar contratos atuais com extrator normalizado e links conciliados; copiar anexos antigos da origem. Evidencia: falha de titulo sob CRLF e diff de nove insercoes/oito remocoes nos contratos. Restricoes: preservar fontes, bytes congelados e sem I/O operacional. Reversivel: sim.

Jev Engineering MCP indisponivel; recibo local sem-jev. Escolha: contratos atuais, extrator puro de teste e migracao incremental. A autorizacao vem do pedido de alinhamento e do fallback do AGENTS.md; nao de uma recomendacao de modelo inventada. scripts/goal.ts nao existe neste checkout.
