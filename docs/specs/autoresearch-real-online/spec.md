# Spec: autoresearch somente com dados reais online

Status: implementado, revisao independente aprovada, duas observacoes reais e gates obrigatorios aprovados
Dono do escopo: usuario, instrucao direta apos a integracao de c8df5f5 no main local

## Contexto

Na abertura deste escopo, o comando canonico bloqueava rede e executava um workload sintetico sobre evidencia congelada. O usuario determinou que, a partir de agora, o autoresearch use somente dados reais obtidos online. A troca de fonte e de avaliador abre uma baseline nova; nenhum placar sintetico anterior serve de comparacao financeira com ela.

## Metas

- Fazer `bash autoresearch.sh` consultar o processo local existente por rotas passivas e uma fonte publica real de mercado ja usada no projeto.
- Avaliar as decisoes reais registradas pelo JEV e o inventario de metricas do painel a partir dessas leituras, distinguindo o instante da consulta, o instante do fato e a cobertura da janela.
- Relatar dados ausentes, antigos, custos desconhecidos e ordens nao conciliadas como lacunas. Nunca produzir um PnL preenchendo custos com zero ou inventando fills.
- Registrar proveniencia sanitizada, hashes, horarios e limites de cada leitura, sem salvar payload privado bruto.
- Permitir observacoes consecutivas reais por invocacoes separadas do comando, sem alterar o scheduler do agente e sem contar duas leituras da mesma decisao como duas decisoes.

## Nao metas

- Enviar, assinar, preparar ou reconciliar manualmente ordens; iniciar ou reiniciar o agente; conectar carteira; mudar risco, alavancagem, credenciais, limites ou cadencia de operacao.
- Fazer consultas pagas novas ao JEV, instalar dependencias, migrar schema/journal ou criar um segundo operador da sessao.
- Transformar preco publico CEX em cotacao executavel DEX, markout em lucro realizado, preferencia Choice em probabilidade de lucro, ou cobertura de dados em vantagem financeira.
- Prometer lucro a cada minuto, qualificar uma estrategia ou comprovar 10x em 24 horas por observacao curta.

## Criterios de aceitacao

- O caminho canonico nao importa o candidato sintetico, nao gera mercado artificial e nao le fixture ou snapshot congelado como fonte de pesquisa.
- Cada execucao consulta online o runtime e a fonte publica. Falha de fonte exigida, formato invalido, resposta futura ou vencida nao aciona fallback offline e encerra com erro explicito.
- Uma coleta real bem-sucedida imprime somente numeros finitos em `METRIC`, proveniencia em `ASI` e um `REPORT` sanitizado. O relatorio nao tem retorno sintetico nem PnL financeiro fabricado.
- Todas as metricas do catalogo existente continuam representadas, inclusive quando unknown. Apenas campos com evidencia atual e semanticamente compativel ficam conhecidos.
- Janela historica real consultada online continua historica; leitura fresca nao rejuvenesce decisao, preco, fill ou custo antigo. Atribuicao a JEV vem do runtime, nao de uma regra local.
- A ausencia de fills, custos, fluxos ou decisao nova fica explicita. Sem evidencia financeira completa, a primaria financeira e desconhecida e nao autoriza promocao/otimizacao por placar operacional.
- Uma execucao real online, uma segunda observacao real e os gates obrigatorios do projeto antecedem a conclusao. Nao executar a antiga campanha sintetica/offline.

## Restricoes

Somente GET de rotas locais passivas e leituras publicas de mercado. `/agent/status` e proibido neste fluxo porque pode adotar configuracao. Nao abrir o dashboard ativo para coleta. Preservar os guards de Origin/Host e os arquivos da sessao. O runtime instalado e trabalho concorrente ficam intactos. Nao registrar enderecos de carteira, referencias de transacao, ids privados, Brief/texto livre, tokens ou segredos nos reports.

## Perguntas em aberto e gate

Nenhuma escolha financeira e delegada ao pesquisador. O desenho operacionaliza leitura passiva e semanticas ja existentes. Perguntas que exijam inferencia paga ou mudanca de permissao continuam com o dono; nenhuma chamada paga sera feita ou alegada como aprovacao. Spec e plan devem receber revisao tecnica independente antes da implementacao.
