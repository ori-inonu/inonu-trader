# ADR-2 Segredos no cofre do Windows, instalador sem chave

Estado: proposta. Requisitos: CFG-1 a CFG-8, WIN-2, U4. Evidência: SPEC 2.1 F12; `src/settings/store.ts` (hoje dotenv em texto puro).

## Contexto

O usuário quer as APIs "pré-configuradas" nesta máquina, sem ter o trabalho de configurar. Hoje `src/settings/store.ts` grava `data/jev.env` e `data/onchainos.env` em texto puro, com `chmod 0o600` apenas "no melhor esforço" no Windows, e o OnchainOS já tem chave, segredo e passphrase em `data/onchainos.env` e a chave do modelo em `.env`. O mesmo `.env` tem a chave privada e o `LIVE_ACK` do trader Kuru, que o app **nunca** deve ler.

## Decisão

1. **Cofre**: `Bun.secrets` (Credential Manager do Windows), serviço `InonuTrader`, quatro nomes: `OKX_WEB3_API_KEY`, `OKX_WEB3_API_SECRET`, `OKX_WEB3_API_PASSPHRASE`, `TYPESAFE_AI_API_KEY`.
2. **Pré-configuração local, não no instalador.** O instalador não carrega segredo algum (WIN-2). Um comando de provisionamento (CFG-9), executado a partir do repositório nesta máquina, e a importação do primeiro início (CFG-2) leem de `data/onchainos.env`, `data/jev.env` e `.env` **só os quatro nomes** (nunca `PRIVATE_KEY`, `LIVE_ACK` ou outro), gravam no cofre e mostram um relatório com estado e os 4 últimos caracteres, **sem valores**. O instalador leva, no máximo, uma dica não secreta do caminho de origem. O assistente que escreveu este pacote nunca imprime esses valores.
3. **Padrões não secretos** (OKX v5, WebSocket público, base OnchainOS, RPCs por rede) vivem em `providers.json` versionado (CFG-5): o usuário só revisa.
4. **Texto puro** continua existindo até o usuário confirmar a remoção (CFG-6): ação separada, confirmada, com backup restaurável.
5. `Bun.secrets` devolve Promises e o `SettingsStore` é síncrono para os chamadores (verificado): o store mantém um **cache em memória com escrita através** do cofre e um estado de falha explícito (nunca "configurado" sem confirmação do cofre); a interface pública do store não muda. As guardas de escrita de `/settings` ficam (loopback, `Host`, origem própria, `x-inonu-settings: 1`, 4 KB, 20 por minuto), adaptadas a mesma origem (T1.6).
6. Teste sentinela: nenhum valor de segredo em resposta, log, erro, journal, Brief nem conteúdo enviado ao modelo.

## Alternativas

| Opção | Por que não |
| --- | --- |
| Manter dotenv em texto puro | É um arquivo comum, legível e copiável por qualquer ferramenta, backup de pasta ou sincronização; o `chmod` não vale no Windows. O Credential Manager também é acessível a processos do mesmo usuário, mas não vira um arquivo que se copia por engano |
| DPAPI via PowerShell ou FFI | Mais código e mais superfície que `Bun.secrets`, que já usa o Credential Manager |
| Embutir a chave no instalador | Vaza em qualquer cópia do artefato; viola WIN-2 e a regra de privacidade |
| Pedir para o usuário digitar tudo de novo | Contraria o pedido (U4); a importação local evita isso sem expor valores |

## Consequências

- O Credential Manager limita o tamanho por entrada; os quatro valores cabem. Se `Bun.secrets` falhar no exe compilado (spike T1.2), a reserva é arquivo cifrado por DPAPI em módulo próprio, sem mudar a interface do store.
- O `jev-read` lê a chave do modelo ao iniciar (CFG-8 do SDD anterior); em modo `--observe` ele não precisa dela. O ledger e o `/inonu/ask` leem do cofre no momento do pedido.
- O relógio do Windows fora de sincronismo derruba assinaturas OKX (tolerância de 30 s): o Doctor mede o desvio e todos os clientes assinados compensam por `Date` (API-2); sincronizar a hora é ação de administrador do usuário.
- A secret key pode ser vista de novo no portal ("View details") ou só na criação, conforme a página (as duas páginas da documentação divergem); o app não depende de rever o segredo.
