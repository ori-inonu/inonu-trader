# Correcao revisavel da autorizacao do hook Jev

Pedido direto do dono em 15/10/2026: investigar e resolver a recusa de testes autorizados, usando recursos locais/gratuitos. Este diretorio prepara a correcao. Nao representa instalacao nem testes executados.

Achados de fonte:

1. `Store.approveFromHumanPrompt` aceita somente a frase inteira. O envelope real `send_user_message_question_reply`, com a frase em `answer`, e recusado. Expiracao, sessao e revisao continuam requisitos validos.
2. `pendingGrant` cria outro desafio a cada tentativa identica, em vez de conservar o desafio pendente ainda valido.
3. `gate` consome a aprovacao antes de `lifecycle` recusar uma escrita por novas instrucoes. A ferramenta nao roda mas a permissao ja foi gasta.
4. A consulta automatica ao modelo para comandos dinamicos sempre termina em `ask`, qualquer que seja a resposta. Pode gastar API sem mudar a decisao.
5. O hash do comando nao inclui o diretorio de trabalho. A correcao o inclui, sem migrar ou reativar autorizacoes antigas.

A correcao aceita somente respostas exatas no campo `answer` do envelope humano reconhecido. Nao aceita a frase dentro da pergunta, texto citado, objetos aninhados ou JSON arbitrario. Mantem uma utilizacao, 15 minutos, sessao, hash do comando, diretorio e scripts. Nao muda hooks.json, confianca nativa, credenciais ou a politica nativa. Nao libera comandos arbitrarios por uma recomendacao do modelo.

O qualificador congela os fontes, cria copia em `%TEMP%` fora da instalacao global, executa os casos novos contra o codigo antigo e guarda RED, aplica as substituicoes somente na copia, exige GREEN e tipos e, por padrao, termina sem instalar. Usa os pacotes locais existentes atraves de um junction somente para leitura. A opcao explicita `--install` habilita a etapa separada de escrita global, depois de qualificar novamente e conferir hashes. A instalacao grava store, policy e lifecycle nessa ordem, com verificacao e rollback por arquivo. A politica nova nao consome nem libera um grant quando chamada sem instrucao explicita; o lifecycle novo o consome somente depois de revalidar instrucoes. Assim, durante a troca de arquivos, um lifecycle antigo apenas nega e pede nova tentativa. Nao reinicia gateway nem agente financeiro. A retirada da consulta automatica so alcanca processos novos do hook. A inspecao remota existente nao muda.

Os testes usam stores temporarios, inspecoes sinteticas e nenhum modelo externo. Nao executam ordens, nao consultam a carteira e nao acessam a home financeira. A revisao independente deve conferir o instalador e as substituicoes antes da instalacao.

O pedido anterior de autorizar Jev automaticamente quando o ambiente estiver em acesso completo nao foi implementado. O evento publico do Codex distingue `permission_mode`, mas nao informa o `sandbox_mode`; `bypassPermissions` sozinho nao prova que a sandbox esteja desativada. Nao existe um sinal verificavel para restringir uma autorizacao automatica a esse caso. A correcao preserva a confirmacao humana exata, em vez de dar ao modelo uma autoridade generica. Fonte primaria consultada: [Codex Hooks](https://developers.openai.com/codex/hooks).
