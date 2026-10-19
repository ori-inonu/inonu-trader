# Spec: validacao do core e do navegador com perfil vazio

Fatia de remaining-system-alignment, base 97ad3e7 e main 2327a28. A observacao anterior do Next de desenvolvimento nao tinha o backend em 3000. O desktop usa por padrao 47321, tambem revalidada sem listener. Esta tarefa verifica o aplicativo integrado com os componentes existentes, sem substituir a observacao operacional pendente por uma afirmacao de ciclo completo.

## Aceitacao

- V1: gerar export estatico novo a partir das fontes atuais, com ambiente minimo sem credenciais, sem .env e sem instalar dependencias. Guardar saida do build, hashes e caminho de saida ignorado pelo Git. Qualquer ajuste automatico de configuracao do Next so pode ser revertido se a mudanca corresponder estritamente aos caminhos gerados conhecidos.
- V2: iniciar core e handlers de producao em loopback, na porta 47321, com home temporario novo e store de arquivo vazio. Usar o parametro runtimeKey existente para impedir descoberta no ambiente/registro, sem alterar a implementacao de autenticacao. Sem vault, conta, carteira, CLI configurada, agendador ou ordens.
- V3: conferir health, status e analise reais por GET, protecao de origem e paginas servidas. Leituras de mercado publico podem funcionar; ausencias de configuracao devem permanecer visiveis. Nao enviar POST, PUT ou DELETE, conectar carteira nem chamar o modelo pela UI.
- V4: abrir a interface exportada no navegador e observar o estado efetivamente renderizado. Registrar erros reais e capturas da propria aba. Nenhuma simulaçao de AgentService ou resposta API para preencher o painel.
- V5: encerrar o processo possuido, confirmar liberacao de porta e integridade de fontes, congelados e dados originais. Guardar o perfil de teste como evidencia, sem migrar ou apagar dados existentes.
- V6: distinguir build, integracao HTTP, tela, modelo publico ja medido e agente operacional. Esta validacao nao demonstra candidatos operacionais, execucao financeira, lucro ou qualificacao de producao.

## Decisao limitada

Pergunta: como observar a integracao atual sem carregar estado ou credenciais pessoais? Opcoes: componentes de producao com perfil temporario vazio e descoberta desligada pelo seam existente; launcher instalado que consulta o vault. Restricoes: V1 a V6 e gates atuais intactos. Reversivel: sim.

Conector Jev Engineering indisponivel. Fallback local sem-jev: perfil novo, componentes existentes e apenas GET. O pedido de testes e navegador autoriza a verificacao; nao se afirma chamada Jev de design, autorizacao financeira ou alteracao de autenticacao. scripts/goal.ts nao existe neste checkout.
