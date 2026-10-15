# Verificação da correção do intervalo

A verificação LIVE da primeira integração falhou: 195 pass, 1 fail, intervalo observado 1ms diante de >=38ms. Tipos globais e focados exit0. Aprovações anteriores são históricas e não qualificam o candidato reparado.

Diagnóstico independente reproduziu o defeito preexistente no candidato e baseline. Um atraso síncrono de 80ms depois da marca antiga permite envios separados por 0..1ms; controle antes da marca passa. A execução original não identifica qual pausa ocorreu.

OR-04: regressões públicas injetam atraso apenas na primeira leitura de secret/apiKey/passphrase, medem entrada real no fake fetch com relógios wall e monotônico e mantêm o limite >=38ms. Antes da correção: 0 pass, 3 fail, 9 expects. Correção: RequestInit preparado antes da marca lastSentMs; marca imediatamente antes de cada fetch, também no retry. HMAC, prazo único, gates, ledger e retry limitado preservados.

Após a correção isolada: cliente 47 pass/0 fail/156 expects; Onchain 199 pass/0 fail/775 expects/11 arquivos; tipos estritos dos quatro arquivos exit0. Manifesto fixa hashes de fontes e logs. OR-01/02/03 continuam requerendo revisão independente junto com OR-04.

Sem env, segredos, rede, modelo real, carteira, ordem, servidor, publicação, staging ou commit. Integração CAS e verificação LIVE do candidato reparado ainda pendentes.
