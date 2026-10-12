# Implementação e dependências

SPEC congelada permanece intacta. Baseline f626a3026a524f61d7e9f7baf6ad6c54ebf89a6c.

## Portas e preservação
As portas 3010/3011 estavam ocupadas por outros serviços e foram preservadas. Probe TCP confirmou 3020/3021 livres. Substituição local reversível, grounded no critério P7: backend loopback 3020, frontend 3021, origins permitidas exclusivamente localhost/127.0.0.1:3021. Nenhum critério P1–P7 foi modificado.

## Fontes reais
O fluxo padrão não faz requests externos nem lê .env, PRIVATE_KEY ou OPERATOR_*. Retorna hold inventory_access_unverified e registra o ciclo.
P2 permanece pendente. A pesquisa verificou clientes existentes de Balance API e DEX Quote, mas não comprovou acesso autorizado, cobertura completa do inventário, contrato das unidades, inclusão de todas as taxas das cotações ou preço/allowance da inferência. Feed público de OKX Exchange não comprova saldos/operação da Wallet. Recibos do Jev Workflows são consultas técnicas, nunca episódios financeiros do piloto.

Interfaces PilotDeps/PilotBundle permitem integrar fonte e modelo somente depois dessas qualificações. Nenhum booleano de qualificação está conectado automaticamente a variável de ambiente. A ligação real foi adiada por falta de qualificação verificável. Não declarar adapter real completo ou P2 aprovado.

## Demonstração sintética explícita
`bun --no-env-file run pilot:fixture` inicia uma fonte, cotação e decisão fictícias, com source=fixture e nome de modelo fixture. Não há fallback fictício no fluxo padrão. Valores e margem positivos desse cenário servem somente à verificação do software, sem inferir lucro, probabilidade de ganho ou qualidade do GEV real.

## Operação local
Na raiz deste worktree: `bun --no-env-file run pilot` (modo padrão indisponível e seguro).
Em outro terminal, na pasta web: `bun --no-env-file run node_modules/next/dist/bin/next dev --port 3021 --hostname 127.0.0.1`.
Não iniciar se as portas já estiverem ocupadas. Não parar processos alheios. Não iniciar src/index.ts ou scripts/okx-operator.ts para o piloto.
Os ciclos são gravados em data/pilot com arquivo exclusivo por processo; endereço completo não é persistido. O painel elimina resultados ao mudar contexto ou expirar. O diário conserva a evidência histórica.
