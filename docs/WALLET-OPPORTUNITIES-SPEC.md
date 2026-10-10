# Carteira X Layer e arquitetura de oportunidades

Data: 2026-10-09.

## Objetivo e autorização

O usuário relata USDT em X Layer, enquanto a interface só consultava MON e USDC na Monad. Corrigir leitura e atualização da carteira e especificar a evolução de oportunidades do Jev. Entrega de código local e documentação; não há autorização para ordens, transferências, assinaturas, aprovações de tokens, execução financeira autônoma, publicação, push ou commit.

Uma conta pode ter ativos em várias redes. Rede da conexão não equivale a patrimônio consolidado. O montante informado pelo usuário não será fixado no código, usado como resposta de RPC, registrado em evidência pública nem tratado como observação onchain.

## Evidência e fontes

- Baseline local: painel e sessão só aceitam Monad 143 e leem dois ativos; atualizar consulta só a rede do provider. Eventos invalidam a leitura, sem iniciar nova consulta. Testes baseline: 12 passam, 66 expectativas; produção web compila.
- [X Layer: rede 196, moeda OKB e RPC](https://web3.okx.com/id/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information).
- [Contratos oficiais X Layer](https://web3.okx.com/pt/onchainos/dev-docs/xlayer/developer/build-on-xlayer/contracts): USDT `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`, USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`.
- [Circle, 6 agosto 2026](https://www.circle.com/blog/now-available-native-usdc-cctp-on-x-layer) e [OKX, 7 agosto 2026](https://web3.okx.com/learn/usdc-cctp-on-xlayer) distinguem USDC nativo `0xB6CEceAB302E2E4948951eE7843FC24E92933061`, USDC_Bridged `0x74b7F16337b8972027F6196A17a631aC6dE26d22` e USDC.e `0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035`. A tabela de contratos e a lista de tokens antigas ainda chamam o bridged de USDC: os anúncios recentes, com contratos precisos, resolvem esse conflito.
- [Lista de tokens OKX](https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json): USDT0 e USDC_Bridged, 6 casas decimais. Consultas públicas `decimals()` aos contratos USDT e três variantes USDC em `https://rpc.xlayer.tech`, sem conta privada, retornaram 6 em 2026-10-09. Nativo OKB: 18 casas decimais, conforme [integração X Layer](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/builder-codes/integration).

Esta SPEC adiciona X Layer em resposta à correção explícita do usuário; não substitui silenciosamente os critérios Monad O1–O8 de `OKX-SPEC.md`. Preserva sua segurança, precisão e leitura sem execução. Patrimônio multichain completo e valuation USD dependem de acesso e cobertura comprovados; não fazem parte da correção presente.

## Aceitação imutável

| ID | Comportamento e evidência exigida |
| --- | --- |
| W1 | Descoberta continua ancorada em `okxwallet`, sem aceitar spoof de EIP-6963 nem solicitar acesso ao montar. Só o clique conectar usa `eth_requestAccounts`. Sem segredos ou persistência da carteira. |
| W2 | Sessão aceita Monad 143 (`0x8f`) e X Layer 196 (`0xc4`). Monad mantém MON/USDC; X Layer consulta OKB/USDT/USDT0/USDC/USDC_Bridged/USDC.e pelos contratos acima, com variantes separadas. Redes desconhecidas não recebem chamadas de saldo. Troca apenas por ação explícita, nunca adiciona rede automaticamente e confirma a cadeia alvo antes de ler. Recusa mantém instrução manual correta para o alvo. |
| W3 | Seleção de bloco único antecede saldo nativo e `balanceOf` de cada ativo monitorado. Quantidades exatas por bigint/strings, 18 casas nativo e 6 nos stablecoins configurados. Teste X Layer discrimina contratos, variantes e uma quantidade fracionária não trivial. Zero somente de resposta RPC válida. |
| W4 | Eventos de conta/rede invalidam imediatamente saldos antigos e iniciam uma leitura coalescida da sessão atual por `eth_accounts`/`eth_chainId`, sem novo pedido de autorização. Inclui eventos durante conexão. Resposta atrasada nunca restaura conta/rede antiga. Desconectar, conta vazia/inválida e dispose cancelam consultas; troca explícita não é cancelada por sua própria atualização automática. |
| W5 | Timeout, recusa, resposta malformada ou falha de qualquer ativo tornam o lote indisponível, com erro sanitizado; não apresentam zero, lote parcial silencioso ou mensagem crua do provider. Cleanup remove listeners. Testes baseline de concorrência e permissões continuam cobrindo seus comportamentos. |
| W6 | Painel mostra rede e símbolos corretos, distingue USDT/USDT0, mostra bloco e explica ativos monitorados/consulta parcial. Monad orienta USDT em X Layer; ação `Trocar para X Layer` disponível após conectar. Nenhuma soma de moedas, total USD fictício ou alegação de patrimônio completo. Token USDT não paga gas da X Layer: identificar OKB sem ordenar compra/transferência. Português, teclas/botões existentes e estilo preservados. |
| W7 | Não conectar saldo ao executor, não mudar backend/estratégia atual, não usar preço do feed simulado, não emitir ordens/transações/assinaturas/approve, não enviar conta ao Jev/backend/analytics. Nenhuma dependência instalada nem mudanças concorrentes revertidas. |
| W8 | Regressão falha antes da correção pelo seam público WalletSession; suite de carteira, TypeScript e build web passam após. Render de painel ou UI local verifica símbolos/rede/cobertura. Revisão independente em cópia isolada contra esta SPEC e baseline fixo. Verificação nativa registra apenas estado sanitizado; extensão bloqueada não é contornada, testes sintéticos não comprovam saldo real. |
| A1 | Documento de arquitetura descreve contratos de inventário, adapters por venue, cotações com validade, cálculo econômico determinístico, filtros de risco, escolha finita Jev/hold, autorização separada, execução futura e reconciliação; distingue o existente do proposto. |
| A2 | Matriz cobre spot, futuros/funding, arbitragem DEX e entre venues/redes; explicita custos, capital/gas/margem, atomicidade/risco de perna, liquidez, acesso e evidência para qualificar cada adapter. Conectar Web3 não habilita Exchange/futuros. |
| A3 | Ranking depende de retorno líquido conservador em unidade comum, custos documentados sem dupla contagem, freshness e limites de perda/capital; probabilidades Jev não tratadas como calibradas. Reinvestir só resultado realizado conciliado dentro dos limites; relato extraordinário sem fonte primária não vira meta/garantia/parâmetro. |
| A4 | Operação contínua especifica supervisor, checkpoint, idempotência, reconciliação, observabilidade, interrupção por dados/contabilidade divergentes e fases readonly→paper/demo→qualificação→execução autorizada. Próxima etapa elegível concreta é scanner readonly X Layer com qualificação econômica, sem ativar trades nesta entrega. |

## Plano e verificação

1. Regressão X Layer e lifecycle no seam público; observar vermelho em baseline.
2. Configuração finita de redes/ativos e leitura exata; extensão da troca explícita e coalescência de eventos.
3. Hook e painel com rede/saldo/cobertura; render verificável.
4. Suite carteira, typecheck e build em cópia isolada sem .env e sem install. Documento da arquitetura com fontes primárias.
5. Revisão independente congelada, correções e checks novamente. Integrar apenas arquivos exclusivos se hashes baseline ainda forem atuais e lease local liberar. Caso haja conflito, preservar entrega isolada e relatar dependência exata.

As evidências de baseline, regressões e revisão são mantidas localmente. A integração preserva as mudanças concorrentes. Nesta entrega, o código alterado limita-se à sessão, hook, painel e testes da carteira; páginas, estilos e backend são preservados.

## Exclusões e limites

Sem preços USD, NFTs, discovery de todos os tokens, saldo Exchange, staking/debt/margin, autorização de Bridge ou gasless, redes além das duas acima, trades reais e promessa de lucro/uptime 24h. Um painel finito não descobre patrimônio completo; isso exige uma etapa distinta com cobertura e preços verificáveis. A ausência de OKB limita execução futura, não impede leitura por RPC.
