# Integração local das cotações OKX DEX — V4

Em 2026-10-09, o integrador copiou os bytes aprovados da cópia V4 recovery após conferir 53/53 hashes do manifesto e o parecer independente DF641E8DE3EFC1B70585AAA76D6829266E1D834FBEEA33E6234A7E6B97467015. Foram adicionados sete arquivos e somente os seams previstos de package.json/tsconfig.json.

Preservação: 31/31 fontes e 4/4 scripts preexistentes mantidos byte a byte. Inclui a mudança concorrente de doctor.test.ts com timeout de 15 segundos e scripts/backtest.ts SHA F5D928A623D9995E95AEEB5132FA479E90CA4216636AF13867794A73191441E8. A cópia V4 antiga do backtest não substituiu a versão atual.

Manifesto integrado: DEX-V4-ROOT-INTEGRATED-MANIFEST.json, 44 arquivos, SHA-256 891DF564D744D84802B0793773FB7B8826C89A71275595225353B30CE42F94C0.

Verificação executada no checkout C:/Users/gabri/jev-trader:

- bun --no-env-file test src/okx-market/okx-dex.test.ts src/okx-market/round-trip.test.ts src/okx-market/dex-cli.test.ts: exit 0; 30 pass, 0 fail, 573 expect() calls, 3 arquivos, timeout global padrão.
- bun --no-env-file run typecheck: exit 0.
- bun --no-env-file run scripts/okx-dex-quote.ts: exit 0; source=synthetic, inputAtomic=1000000, outputAtomic=995000, quotedGrossDeltaAtomic=-5000, netAtomic=null, execution=not_qualified, liveQualified=false.

A suíte completa não foi repetida no root para evitar leitura automática de .env por scripts preexistentes. A execução isolada da composição antecipada é evidência separada e precisa ser lida com seus próprios limites; não se infere execução de um arquivo omitido.

Esta integração não executou endpoint remoto, ordem, aprovação, transferência, assinatura, pagamento ou conexão de carteira. As quantidades são fictícias e não medem retorno financeiro. Credenciais, permissão/tier/quota, saldo e capacidade de execução live continuam sem qualificação. A revisão independente da integração é um passo separado do parecer V4 sobre o snapshot.
