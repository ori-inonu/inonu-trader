# Consultar relatórios no painel

O servidor de relatórios permite abrir os resultados locais do operador e do System One sem iniciar o bot. Ele lê arquivos existentes, escuta somente `127.0.0.1` e informa `executionEnabled: false` em `/health`. Não produz dados de mercado, não carrega `.env`, não usa chaves e não conecta a carteira.

No diretório do projeto, com Bun instalado:

```powershell
bun --no-env-file --no-install run reports:serve
```

Por padrão, usa porta `3000`, arquivos de `data/` e permite o painel em `http://localhost:3001` ou `http://127.0.0.1:3001`. Deixe esse terminal aberto; `Ctrl+C` encerra somente esse processo. O servidor não continua depois de fechar o terminal ou reiniciar o computador.

Para a prévia verificada da sessão na porta `3007`:

```powershell
bun --no-env-file --no-install run reports:serve --origin http://127.0.0.1:3007
```

Quando há `--origin`, somente os valores explícitos são permitidos; repita a flag para permitir mais de um painel local. São aceitas apenas origins HTTP(S) canônicas de `localhost` ou `127.0.0.1`, sem barra final, caminho, credenciais ou wildcard. A URL e a porta devem coincidir exatamente com as do navegador. O servidor também restringe o Host à própria porta local; CORS não é autenticação para processos no computador.

Para outra pasta ou porta:

```powershell
bun --no-env-file --no-install run reports:serve --data-dir C:/caminho/absoluto/data --port 3000
bun --no-env-file --no-install run reports:serve --help
```

Se mudar a porta, o frontend precisa ter sido construído com `NEXT_PUBLIC_API_URL` correspondente. O servidor de relatórios não reconstrói nem reconfigura o frontend.

Os endpoints são:

| Endpoint GET | Conteúdo |
| --- | --- |
| `/`, `/health` | Identidade do servidor e modo de leitura |
| `/operator` | `data/operator/latest.json` |
| `/operator/history` | Últimos ciclos de `data/operator/cycles.jsonl`; `?limit=40` limita a resposta |
| `/operator/insights` | Resumo descritivo do journal existente |
| `/system-one` | `data/system-one/latest.json` |

Os relatórios mantêm seus timestamps e podem estar antigos. A leitura seguinte vê mudanças feitas por um produtor separado; este servidor não roda o produtor. A orientação legada presente em erro de `/system-one` também não é executada. Produção autenticada exige sua própria configuração e verificação antes de iniciar scripts que usam APIs.

O feed de blocos `/events` e o histórico de blocos `/history` retornam `404`. O indicador desse feed pode continuar desconectado enquanto os relatórios do operador e do System One estão disponíveis. Não existe snapshot fictício para simular conexão ao mercado. Ler um relatório não comprova saldo atual, autenticação OKX/JEV, transação executada ou lucro.

`404` em um relatório indica arquivo ausente; `500` indica arquivo inválido ou ilegível; `413` no journal indica tamanho acima do limite do handler. `/health` continua disponível nesses casos. `403` indica Host ou Origin não permitidos; `405` indica método diferente de GET/OPTIONS em rota conhecida. Porta ocupada ou configuração inválida encerra a CLI sem iniciar outro servidor; escolha uma porta livre, sem parar processos de outra tarefa.

Relatórios podem conter endereço público e dados de inventário. Use apenas no computador local. Não exponha esse servidor por proxy/túnel. A conexão manual da extensão OKX, a leitura de conta/rede/saldo e a confirmação futura de propostas são etapas independentes. Este comando não pede assinaturas, aprova tokens, faz swaps, ordens, depósitos ou saques.
