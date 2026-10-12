# Conferência manual de propostas OKX

O painel da carteira contém uma seção **Revisar proposta**. O campo **Proposta em JSON** começa vazio. Conecte a carteira, insira uma proposta e use **Conferir na carteira**. Digitar não consulta o provider. **Limpar** remove o conteúdo e invalida qualquer resposta pendente.

**Origem não verificada. Esta consulta confere formato, conta, rede e prazo; não comprova segurança, custo ou retorno.** Todos os estados mantêm **Execução não habilitada**. Não há assinatura, envio, autorização de token, ordem ou integração Exchange neste fluxo.

## Contrato e apresentação

O hook `useOkxWallet` expõe `preflightTransaction(input: unknown)` e delega à sessão existente. Sem sessão, retorna `blocked/session_unavailable`, com `executionQualified: false`, sem solicitar contas. O caminho elegível da sessão realiza `eth_accounts`, `eth_chainId`, `eth_accounts`, `eth_chainId`, sequencialmente. A descoberta, conexão e leitura de saldos mantêm seus próprios contratos.

A entrada é limitada a **262144 unidades UTF-16 antes de JSON.parse**. A validação estrutural continua em `validateWalletTransactionProposal`: os 13 campos, redes, valores atômicos, prazo e calldata de até **131074 caracteres** permanecem os da biblioteca existente. Números atômicos são strings decimais; não há reviver, eval ou conversão para Number.

O resultado conferido apresenta a cópia normalizada capturada pelo método: plano não verificado, identificador da cotação não autenticado, rede, origem, destino, valor atômico e teto de gas (`gasLimitAtomic × maxFeePerGasAtomic`, calculado com BigInt). Os horários são observação e validade em milissegundos Unix. Não representam inclusão em blockchain, preço em reais/USD ou cobertura pelo saldo. A calldata completa é texto escapado em detalhe recolhível, com contagem de bytes e caracteres.

As propostas permanecem apenas na memória da seção. O fluxo não monta HTML ou links a partir da entrada, registra seu conteúdo em logs, usa storage/analytics, copia para clipboard, baixa arquivos ou envia o texto ao servidor/JEV. A fixture e os recibos de teste utilizam exclusivamente dados fictícios.

## Invalidação e retomada

`createWalletProposalReview` é a fronteira pública do estado: `getSnapshot`, `subscribe`, `edit`, `clear`, `check`, `validateCurrent` e `dispose`. A geração monotônica do conteúdo descarta respostas antigas; a geração monotônica da sessão invalida antes das ações do hook e das publicações da sessão. Troca de provider, conta/rede A→B→A, disconnect, edição, limpeza e desmontagem removem o resultado. Cliques repetidos durante a mesma consulta não criam outra consulta.

Uma aba oculta retém o resultado. O relógio e a geração são conferidos sincronicamente em `resume`, `pageshow`, `visibilitychange` para visible e `focus`, antes de publicar ou agir sobre o resultado. Em primeiro plano, a cadência nominal é 1000ms. Expiração inclusiva, relógio inválido ou regressivo bloqueiam na primeira oportunidade de execução, inclusive quando a consulta ainda está pendente. Nenhum evento de retomada consulta o provider automaticamente. A cadência não garante prazo de parede enquanto o navegador estiver suspenso. O timer usa intervalo fixo e não calcula um timeout a partir de TTL longo; timers e listeners são removidos na desmontagem.

## Verificação local

O candidato inclui testes públicos do controlador, renderização das mensagens/atributos e montagem real do hook/painel em React com Chrome instalado e perfil temporário. O provider, relógio e timers externos são controlados; todas as requisições são registradas e o acesso de página a rede externa é bloqueado. Isto não certifica egress do sistema operacional, extensão nativa, conta real, assinatura, SSR/hidratação, rentabilidade ou ativação financeira.

Os recibos em `evidence/` preservam argv, cwd, nomes de variáveis de ambiente, timeout, exits, stdout/stderr, hashes e snapshots de cada RED/GREEN e da verificação final. Bun usa `--no-env-file --no-install`; TypeScript roda diretamente com `--noEmit --incremental false`. O bundle de montagem é o build pertinente. O build completo de Next permanece não executado: as fontes externas da aplicação ainda não possuem uma dependência de rede qualificada nesta execução.

Integração e revisão independente pertencem ao coordenador. Esta entrega não aprova a própria implementação nem habilita operações financeiras.
