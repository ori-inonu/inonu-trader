# Inteligência de decisão do Inonu

Pasta SDD desta entrega: [SPEC.md](SPEC.md) (requisitos e aceitação), [TASKS.md](TASKS.md) (tarefas e estado) e `evidence/` (o que foi executado). O plano completo e as razões estão no plano aprovado da sessão; o SPEC é a versão que o repositório guarda.

## Coordenação com outras sessões (conferida em 2026-10-13, 13:28)

Há uma sessão concorrente **ativa** ("Mesa de decisão e consulta de carteira", [docs/sdd/mesa-decisao-20261013/SPEC.md](../mesa-decisao-20261013/SPEC.md)) escrevendo agora em:

| Caminho | Dono no momento | Regra desta entrega |
| --- | --- | --- |
| `src/inonu/ask.ts`, `src/inonu/jev-model.ts` (+ testes) | escritor exclusivo da sessão da mesa (entrega 2 do SPEC dela) | **não editar**; o que precisar entrar fica em arquivo novo e vira pedido de ligação |
| `src/inonu/source.ts`, `src/inonu/http.ts`, `src/desktop/handlers.ts` | "root" daquela sessão integra se necessário | edição só aditiva, curta, com `git status` e data de modificação conferidos na hora |
| `web/src/components/Desk/InonuAsk.tsx`, `web/src/lib/inonu/accept.ts`, `web/src/lib/wallet/**` | root daquela sessão | **não editar**; `VereditoCard` nasce em arquivo novo |
| `src/quant/**`, `scripts/quant-capture.ts` | sessão da mesa (GARCH, calibração, probabilidade de toque, cauda) | **só ler**; reusar `calibration.ts` e `touch.ts` depois que estabilizarem, sem duplicar |
| `src/settings/**`, `src/desktop/vault.ts` | sessão da mesa (descoberta de credencial) | não editar |

Conflitos de requisito conhecidos e como esta entrega os resolve: o SPEC da mesa (PORT-2) proíbe recomendar "tamanho, retorno, probabilidade ou confiança numérica sem medição". Aqui o tamanho é **aritmética sobre o risco que a pessoa escolheu** (VER-4, rotulada como cálculo e não previsão); a confiança é uma **faixa qualitativa** (baixa, média, alta) sobre a consistência das respostas do modelo, e nenhuma probabilidade de ganho é mostrada enquanto o portão do Aprendiz (ML-3) não passar.

**Desvio registrado (2026-10-13, 14:15):** o quadro acima dizia para não editar `InonuAsk.tsx`, mas o cartão do Veredito só aparece se o cartão de resposta o desenhar. Depois de conferir que `InonuAsk.tsx` estava sem mudança desde 13:28 e `lib/inonu/client.ts` desde 13:39, fiz duas edições curtas e aditivas: em `client.ts`, o campo opcional `veredito` e sua leitura estrita (um Veredito ilegível é descartado e a resposta aparece como antes); em `InonuAsk.tsx`, um bloco que desenha `VereditoBody` no lugar da frase fixa quando há `veredito`, mantendo Aceitar, Ignorar, Silenciar e a proveniência do modelo. Também uma linha em `DockInonu.tsx` (painel Medicao). Se a sessão da mesa preferir outro ponto de ligação, basta desfazer esses três pontos: nada mais depende deles. Os testes dos dois lados passam com as edições.

Pastas **novas e livres** desta entrega: `src/intel/ta/`, `src/intel/features/`, `src/intel/ml/`, `src/outcomes/`, `src/verdict/`, `web/src/lib/veredito/`, `web/src/lib/glossario/`, `web/src/components/Veredito/`, `docs/sdd/inteligencia-decisao/`.

Regras operacionais: nunca `git add -A`; não remover o worktree `C:/Users/gabri/jev-trader-main`; não reiniciar processos nas portas 3000, 3001, 3030 e 3031; antes de editar arquivo existente, `git status --short -- <caminho>` e data de modificação.
