# Carteira conectada, Radar e decisoes

Objetivo: corrigir falhas observadas e verificar clareza, controles e responsividade com carteira conectada e backend local disponivel. Sem ordens, assinatura, consultas pagas ou publicacao.

## Criterios independentes

- CU-1: carteira conectada sem observacao nao recebe instrucao para conectar novamente. Estados desconectado, conectando, lendo, rede nao suportada e leitura indisponivel explicam a proxima acao adequada.
- CU-2: uma rede conhecida e identificada mesmo sem leitura de saldos. Rede desconhecida nao e inventada. Consentimento e consulta continuam desabilitados ate haver leitura valida, fresca e correspondente a conta e rede atuais.
- CU-3: um HTTP 404 da leitura nao e descrito como prova de servidor antigo. A interface distingue rota indisponivel, falha de conexao e ausencia de credenciais sem fabricar saldo ou patrimonio.
- CU-4: Carteira, Radar e decisoes sao revisados visualmente em desktop (1440x900) e celular (390x844 e 320x700), com aba e controles alcancaveis, rolagem do painel inferior e sem corte horizontal essencial. Capturas reais sao separadas de fixtures sinteticas.
- CU-5: a disponibilidade do backend e demonstrada por resposta do endpoint exato do servidor local seguro. Preservar guards de origem e acesso local. Credenciais, leitura real de saldos e respostas do modelo que nao puderem ser exercitadas permanecem limitacoes declaradas.
- CU-6: preservar contratos Jev/Monad/Kuru, freshness, identidade, consentimento e arquivos concorrentes. Nao enviar ordens, alterar rede da carteira, publicar, usar texto renderizado com ponto medio/travessoes ou criar indicadores pulsantes.

## Entrega minima

1. Congelar baseline e evidencias; implementar em copia isolada.
2. Obter testes de regressao vermelhos para CU-1 a CU-3, corrigir e verificar testes e tipos pertinentes.
3. Disponibilizar somente o runtime local de leitura necessario; nao iniciar src/index.ts.
4. Revisar as tres abas nas dimensoes declaradas e corrigir somente defeitos confirmados.
5. Revisao independente da copia, integracao por hashes e leitura real da interface final. Registrar limitacoes e evidencias no checkpoint.

Fonte da falha: captura real de Carteira conectada em Ethereum; preparePortfolio agrupa estados distintos na mesma mensagem; PortfolioConsultation so nomeia Monad e X Layer; holdingsErrorText atribui HTTP 404 a versao antiga sem prova.
