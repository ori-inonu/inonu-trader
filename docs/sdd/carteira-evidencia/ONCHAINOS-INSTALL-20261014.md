# Instalação oficial OnchainOS no Codex

Data: 2026-10-14. Conversa: `01a136cd-3af3-7361-bd23-c23a6aeece97`.

## Escopo observado e critérios desta etapa

O usuário solicitou explicitamente executar `npx -y @okxweb3/onchainos-installer install`, instalar as skills no agente atual e verificar Node >= 18. Essa instrução posterior autoriza a instalação e substitui, para esta etapa, a antiga restrição de inspeção do registro inicial. Não autoriza automaticamente criar conta, depositar, pagar serviços ou enviar ordens. O material Wallet API enviado depois orienta a investigação dos dados e da execução.

Critérios verificáveis: INST-1 Node >= 18; INST-2 binário oficial instalado e versão verificável; INST-3 sete skills oficiais no diretório reconhecido pelo Codex; INST-4 registrar falhas e correção sem alterar arquivos do aplicativo; INST-5 diferenciar instalação de integração, autenticação e operação real. Estes critérios delimitam a instalação e não substituem os WAL-01 a WAL-06 congelados.

## Resultado verificado

- `node -v`: `v26.9.0`, já instalado.
- `C:/Users/gabri/.local/bin/onchainos.exe --version`: `onchainos 4.6.4`.
- SHA-256 do binário: `D7F8C8DFBD98F4E3EB9F4A7F2D8BD4167CC861322E28598DB30EA9D7D08B5FE8`.
- Script oficial: `Checksum verified.`; CLI e workflows instalados; diretório do CLI adicionado ao PATH do usuário.
- Workflows: `C:/Users/gabri/.onchainos/workflows`, incluindo `portfolio-check.md`, `wallet-analysis.md`, `wallet-monitor.md`, `wallet-monitor-ws.md`, `token-research.md` e `smart-money-signals.md`.
- Instalação oficial complementar: `okx-a2a environment check completed.`, exit 0. Esse resultado não comprova login, daemon ativo, permissões de carteira ou disponibilidade de cada serviço.
- `npx -y skills add okx/onchainos-skills --yes -g --agent codex`: exit 0; sete skills instaladas em `C:/Users/gabri/.agents/skills` para Codex.
- `onchainos wallet --help` lista login, status, saldos, histórico, envio e contract-call. Executar help não autentica nem habilita a carteira no app.

| Skill | SHA-256 de SKILL.md |
| --- | --- |
| okx-agent-payments-protocol | A9E4D70D3C0E7DB8F273DB5C626E3B1EC84C9922DAA767D0EFFE27C2FF4567C8 |
| okx-agentic-wallet | 5A89E0003CB56EFFDFA592F283A820091019E9F7E66A429453164237743DF4BF |
| okx-ai | 4BCFC876FEF8702FECC59C1B5847B1E8F93FA365F0AD0504A3D10940CD006C6F |
| okx-dapp-discovery | 3D0868E2CDCFF34B20730152B5081BD5187F71813EDFA48B4EC6C1A4CBE6F40D |
| okx-defi | 85DEDD70753518E53843AA38EE5407FB2F27EA20F3BE75990FF20DDBF8C71064 |
| okx-dex-market | 2FEAA8FF4AEC201959ED2A4CD0E823EF0E4C264FC2FD701BB63BCFCC1F339FEC |
| okx-guide | B776A4FBDF85F85181ACDF3F8633F4FF54A540680C8256E2281B6CD2824A3CC8 |

Os arquivos estão disponíveis no disco. A descoberta automática no catálogo de uma sessão Desktop já aberta não foi demonstrada; não foi reiniciado o aplicativo. Nesta conversa é possível ler explicitamente as skills instaladas. O PATH do processo já aberto também pode exigir o caminho absoluto, usado nas verificações.

## Falhas e compatibilidade Windows

Origem verificada: [repositório oficial OKX](https://github.com/okx/onchainos-skills). Instalador npm: `@okxweb3/onchainos-installer@0.0.1-beta-4af28c368a-260910124122`, tarball oficial inspecionado com scripts de instalação desabilitados. SHA-1 publicado do pacote: `6a272a82bf94f3ce6d075104178088198f48da14`.

1. O comando solicitado falhou com exit 1 antes de instalar. O lançador oficial escolhe `powershell.exe` no Windows. Windows PowerShell 5.1 interpretou incorretamente o arquivo UTF-8 sem BOM; erros `MissingEndCurlyBrace` e ausência de catch/finally nas linhas 290, 302, 322 e 487 de `lib/install.ps1`.
2. Prova local: `Parser.ParseFile` no PowerShell 5.1 encontrou quatro erros; leitura explícita UTF-8 seguida de `ParseInput` encontrou zero; PowerShell 7.6.5 encontrou zero. Na cópia privada em `C:/Users/gabri/.codex/tmp/okx-installer-01a136cd/package`, adicionar BOM preservou o texto decodificado, SHA-256 `BC98271183E918F0825321911D87F90FEEEEC16CBA9EF7A0044874DE2D624D1B`, e eliminou os erros de parsing no 5.1.
3. O lançador com essa cópia passou o parsing, mas falhou em `Get-FileHash` não reconhecido, linha 265. Uma sondagem isolada encontrou o comando disponível nos dois PowerShells; a causa desse segundo problema no subprocesso permanece desconhecida.
4. O mesmo script oficial foi então executado com PowerShell 7.6.5 e `-stable`, concluindo a instalação e a verificação de checksum. As skills foram instaladas separadamente pelo comando oficial com `--agent codex` para limitar o destino ao agente solicitado.

Comando que concluiu o componente CLI:

```powershell
& 'C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe' -NoProfile -File 'C:/Users/gabri/.codex/tmp/okx-installer-01a136cd/package/lib/install.ps1' -stable
```

Somente a cópia privada do instalador recebeu BOM. Não foram alterados o cache npm original, o PowerShell global, hooks nativos, arquivos de implementação ou mudanças concorrentes do projeto.

## Wallet API e autonomia: fatos atuais

- [Get Total Value](https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-total-value): `GET /api/v6/dex/balance/total-value-by-address`; `assetType=0` inclui tokens e DeFi e é o padrão; `1` somente tokens; `2` somente DeFi. Retorna USD. Para comparar com linhas de tokens, o escopo deve ser explícito; total geral não comprova soma conciliada nem capital realizável.
- [Transaction Gateway](https://web3.okx.com/onchainos/dev-docs/wallet/onchain-gateway-api-overview): simulação e broadcasting são capacidades documentadas; não substituem identidade, signer, política ou reconciliação.
- [Transaction History](https://web3.okx.com/onchainos/dev-docs/wallet/tx-history-api-overview): histórico multirrede com paginação e detalhes de transações, incluindo taxas. É fonte para conciliação; uma variação de saldo, isoladamente, não prova lucro.
- [Skill oficial Agentic Wallet](https://github.com/okx/onchainos-skills/blob/main/skills/okx-agentic-wallet/SKILL.md) e `references/strategy.md` instalados: ordens com gatilho ficam no TEE e executam automaticamente; seis redes incluem Solana 501. A referência determina confirmação de criação, expiração em sete dias e default de slippage de 15%. Esses defaults não são um perfil de risco aprovado para este projeto.
- `references/swap.md` oficial documenta modo Silent/Automated com opt-in explícito. Portanto, a afirmação ampla da proposta concorrente `docs/sdd/agente-autonomo/SPEC.md:17` de que a OKX não documenta operação sem confirmação precisa de revisão pelo dono antes de congelar a integração. A proposta não foi alterada nesta etapa.

## Estado da integração e próxima dependência

Instalação concluída. Integração autônoma no aplicativo não ativada.

A auditoria de código encontrou Inonu/System One consultivos e operador separado, com execução EVM e bloqueio Solana. O controlador atual de carteira perde sua instância de consulta durante refresh; transformar o botão manual em intervalo não preservaria corretamente o consentimento. O Brief de carteira inclui saldos, e a seleção do operador inclui valores agregados; não podem ser tratados como dados públicos para envio automático.

Próxima entrega elegível: integrar a coleta Wallet API e o estado da Agentic Wallet num controlador único, com projeção de dados, orçamento, cancelamento, registro e comparação de retorno líquido contra manter os ativos. Começar em modo sombra; autenticação e políticas precisam de verificação real antes de qualquer execução. Preservar arquivos reservados e coordenar a proposta concorrente antes de implementar nesses caminhos.

Não houve login, criação de wallet, consulta privada nova, funding, assinatura, pagamento x402, transmissão, ordem, ML treinado ou lucro demonstrado nesta instalação. Custo de consultas Jev permanece desconhecido quando não informado; downloads não demonstram ganho financeiro.

## Decisão consultiva registrada

Para verificar e registrar a instalação antes de editar integração concorrente, Jev Workflows recomendou `verify_record_install`, confiança 1, modelo `jev-1.13.0`, recibo `e3ebcf16-e4c1-48e1-a88c-52492312b6a4`, input digest `f669f15e1d56eaae14d723ed59b16cdf15471d551123ce62be42e933dcae6e04`, uso 833/52 tokens, custo não informado. Fonte: resposta real persistida pelo plugin. É conselho técnico, não autorização financeira ou aprovação humana.

A consulta anterior sobre compatibilidade Windows absteve-se: recibo `72d0da16-7dc9-445c-912a-716f032d2e26`, confiança 0.53, 598/62 tokens, custo não informado. A alternativa reversível foi sustentada pelas provas locais de parsing e pela solicitação explícita de instalação; não foi registrada como aprovação do Jev.

Revisão independente da etapa: **APPROVE** para INST-1 a INST-5, sem achados concretos. Revisor `/root/settings_review`, executando leituras e versões em contexto separado. Parecer: `C:/Users/gabri/.codex/tmp/agentic-01a136cd-review/REVIEW-INSTALL.md`, SHA-256 `C3FA231D8D894B466F13E8860214A6909FAA30C52508B3CAED734C079F76EA3F`. Baseline revisado deste documento: `4CB2BAFD89F21AC2DA384C8D698842310B09FE1B7DA5FFF2427AF937C6FA4839`. Esta atualização somente registra o parecer recebido; o aceite não certifica autenticação, integração ou operação financeira. O catálogo da nova sessão do revisor listou as sete skills; a sessão Desktop já aberta do integrador continua sem essa verificação automática.
