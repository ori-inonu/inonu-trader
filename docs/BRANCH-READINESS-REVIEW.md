# Revisão para merge: contrato e evidências

Objetivo observado: revisar a branch/worktree, corrigir lacunas, validar contra main e finalizar somente depois de merge comprovado, preservando outras sessões.

Baseline fixo: main `bd8f78aeb0f3ba8acfc184a3b31699a5c815c8e8`; branch `51edcbc5a17a6805675268ed8dd9703df2b8eebe`. Implementação isolada em `codex/review-main-readiness`. O checkout principal e o worktree `jev-trader-r8` não pertencem a esta implementação e não serão sobrescritos.

## Fontes e critérios imutáveis

- S1: `SYSTEM-ONE.md`, itens 3, 4 e seção "O que ele nao faz": funding, volatilidade ou inventário desconhecidos não podem gerar candidatos elegíveis. Exposição existente mais nova ordem deve respeitar o teto do envelope, sem multiplicar esse teto pela alavancagem.
- S2: `SYSTEM-ONE.md`, item 5: somente hold ou candidato elegível pode ser escolhido. Respostas inválidas, erro, cancelamento e prazo esgotado bloqueiam a decisão. O ciclo deve validar a resposta na fronteira e não publicar texto bruto do provedor.
- S3: `SYSTEM-ONE.md`, item 6 e exclusões: execução sempre bloqueada ou simulada; nenhum teste ou demonstração assina, envia ou altera capital. Mock, dados sintéticos e capital configurado permanecem identificados.
- S4: `R8-re-revisao-operador-f1-f8-20261011.md`, F1-F8 e C1-C9: condições de operação real permanecem abertas até evidência específica. Esta revisão não converte testes offline em qualificação financeira, probabilidades calibradas ou lucro.
- S5: validação pertinente de backend/frontend, análise de tipos e build; revisão independente do código final e auditoria do merge. Nenhum commit inclui trabalho concorrente. A limpeza limita-se a branches/worktrees pertencentes a esta execução e totalmente integrados.

## Plano de execução e fronteiras de teste

1. Revisar diff fixo em padrões e requisitos, preservando R8 como evidência independente.
2. Corrigir uma regressão observável por vez com testes nos contratos públicos já exercitados pelo projeto: buildLeverageBrief, runSystemOneCycle, handler HTTP e CLI. Não criar uma nova arquitetura de testes.
3. Verificar testes afetados e ampliar para suíte, tipos e build. Rever independentemente o resultado antes do merge.
4. Reconciliar main atual, repetir verificações impactadas e limpar apenas após integração comprovada.

Consulta delegada Jev `040e5491-7a50-42f0-97e4-3446fe329fe3`, modelo `jev-1.13.0`, retornou abstenção por baixa confiança. Não houve aprovação humana nem `approved_by=jev_delegated`. `local_fallback`: conservar as fronteiras públicas dos testes existentes e os requisitos inalterados para correções reversíveis. Custo faturado desconhecido.

## Limites de evidência

Não executar operações reais nem consultar segredos. O teste autenticado de C8 e a comprovação de latência/custo/qualidade real não estão estabelecidos. Fechar o código para merge não significa liberar estágio live. A revisão R8 existente não cobre System One e não substitui revisão do novo diff.
