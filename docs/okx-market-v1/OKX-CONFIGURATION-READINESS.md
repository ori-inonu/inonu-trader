# Configuração observada — 9 de outubro de 2026

Esta verificação consultou somente a presença de nomes selecionados de variáveis nos escopos Process/User/Machine do Windows. Nenhum valor ou arquivo .env foi lido. Ausência nestes escopos não demonstra inexistência em outros locais.

- Jev Workflows: consultas reais verificadas por recibos; esta configuração pertence ao plugin.
- TYPESAFE_API_KEY: presente em Process/User, conforme verificação anterior desta mesma sessão; valor não inspecionado.
- Aplicativo: src/config.ts exige TYPESAFE_AI_API_KEY para MODEL=jev. Este nome não apareceu diretamente em Process/User/Machine. Porém docs/JEV-WINDOWS.md e suas evidências anteriores documentam uma referência local a TYPESAFE_API_KEY, a expansão pelo Bun e três respostas reais hold do modelo jev-1.13.0 em paper. A presença direta da variável não era uma verificação completa deste caminho. Não releitura de .env foi necessária nesta checagem; não se reexecutou essa consulta autenticada.
- Scanner Web3: OKX_WEB3_API_KEY, OKX_WEB3_API_SECRET e OKX_WEB3_API_PASSPHRASE não apareceram em Process/User/Machine. Requer credenciais da API Web3 da OKX, distintas da carteira, do JEV e das chaves da Exchange.
- Carteira: código existente usa o provider da extensão para solicitar conexão mediante ação do usuário. Não foi demonstrada conexão da extensão, rede atual, saldo ou capacidade de assinatura nesta execução.
- Depósito de R$400: relato do usuário, sem reconciliação de saldo ou localização entre Exchange e Wallet.

Os comandos de teste e scanner deste ciclo usam Bun --no-env-file. O scanner não solicita PRIVATE_KEY e o modo padrão é sintético. Não foram efetuadas consultas autenticadas de mercado, ordens, assinaturas, aprovações ou transferências.

A próxima integração pode preparar cotações verificáveis em fixtures e simulação sem depender de credenciais reais. Chave de API configurada, API acessível, carteira conectada e operação real qualificada são estados distintos e precisam de evidências separadas. Os registros anteriores já comprovam respostas JEV no aplicativo em paper; não comprovam vantagem lucrativa, acesso OKX Web3 ou execução financeira.
