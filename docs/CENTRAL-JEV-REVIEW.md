# Parecer independente — GrowthDeck e ajuste de testes CLI

Escopo: `GrowthDeck.tsx`, `GrowthDeck.module.css`, `phase-limit-render.test.tsx` e o ajuste autorizado em `scripts/qualify-live.test.ts` da cópia isolada, com baseline informado 51edcbc e correções copiadas posteriormente. Revisão estática independente; nenhuma implementação minha foi revisada. Sem `.git`, não autentico o histórico nem atribuo os achados a regressões introduzidas pelo patch.

Parecer: **nenhum bloqueador identificado nas alterações examinadas; os dois P2 anteriores estão resolvidos em fonte.**

`PhaseLimitCell` (GrowthDeck.tsx:51–56,251) renderiza `PhaseCell.note`, incluindo Kelly, limites mais estritos e carteira operacional. `.cellNote` (CSS:540–548) permite quebra de texto. Os três SSR correspondentes verificam essas qualificações.

O handler das abas (GrowthDeck.tsx:101–114) mantém apenas a selecionada na sequência de Tab, implementa ArrowLeft/ArrowRight com retorno circular e Home/End, impede o comportamento padrão dessas teclas e move foco/seleção para a mesma aba. Não encontrei defeito novo nesse handler por inspeção; interação real com teclado não foi exercitada.

O diff literal `qualify-change.diff` confirma preservação exata das 11 entradas inválidas, de `await run(args)` e das três asserções por caso: exit 2, stdout vazio e “Uso:” no stderr. `--help` preserva exit 0 e as verificações de “Uso:”, “--data-dir” e “nunca envia” no stdout (scripts/qualify-live.test.ts:311–326). Mudam o registro individual dos testes e seus títulos; o diff não altera timeout ou código runtime. Não há perda de cobertura neste ajuste. Separar testes evita acumular as 11 execuções dentro de um único teste, sem provar resolução de lentidão individual. Não executei a suite; timeout15000/exit143 foram informados pelo agente principal.

Correções dos achados anteriores:

- **P2 encerrado — descrição acessível do gráfico.** GrowthDeck.tsx:170 usa `bars.map` para incluir alavancagem, mediana e probabilidade de liquidação das seis barras, com os mesmos campos apresentados visualmente (:190–192).
- **P2 encerrado — referência do veredito.** GrowthDeck.tsx:205 prefixa “Cenario de referencia: 2x.”, consistente com `riskReading(params, 2)` (:76).

Os dois novos SSR (phase-limit-render.test.tsx:25–34) verificam presença de 2x/10x e da referência 2x. O teste do gráfico não valida os valores exatos de todas as barras nem mudanças dos controles; essa cobertura permanece limitada. Nenhum teste, build ou typecheck foi executado por mim. Reprodução e retestes são informações do agente principal.

Aceitação limitada contra o documento congelado: evidência estática favorável às correções de conteúdo/acessibilidade de C2/C3; C5 recebe este parecer independente restrito. C1, C4 e C6 não são certificados aqui. **Não declaro C1–C6 completos**: integração global e browser/aceitação visual permanecem pendentes. Browser não autorizado; nenhuma navegação ou tentativa de contorno realizada. Backend/SystemOne e outros painéis excluídos.

SHA-256 observado dos arquivos atuais:

- `GrowthDeck.tsx`: `1EAEC88C0BD6A8F354CBFCE45FC27742492EA2A54DBC81AECA30E490B6F0B803`
- `GrowthDeck.module.css`: `5EC61B72665E0D06571438B8196B70645743DBACBE0BF6234A004EA910793C94`
- `phase-limit-render.test.tsx`: `C556C16706FA20542FE9070CCA04EC074E921C5CDCA361AF978D2805984769AD`
- `scripts/qualify-live.test.ts`: `A37BE81E6E1A0235AF5EB93E83454F28E6F069D4B808104F473B09006C0A1B4C`
- `qualify-change.diff`: `75D4C32A46290146765E949885F4862CF90EA945DB3C922C4A1CDE8183ACB763`
- Aceitação congelada: `20E1558DA58CEAE78332020F1E4F84277EACDB694748D28B9EA599DC30808054`
