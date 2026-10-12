# HTTP preview: rechecagem independente de capacidade visual

Data: 2026-10-11. Reviewer_id: `01a12ada-7b55-7fd2-8a20-c940f474c1a1`, distinto do implementador `codex-inonu-system-one-safety`. Não implementei o candidato. Sol/xhigh solicitado; modelo/effort/tier efetivos desconhecidos. Workspace exclusivo ordinário, sem RO imposto pelo OS. Origem somente leitura por instrução; único arquivo escrito nesta tarefa é este relatório. Sem auxiliares, mensagens a outras tarefas, rede financeira, modelo, carteira, assinatura, fundos, reinício ou mutação de processos.

Baseline/HEAD confirmado antes e depois das observações: `1f08e6edd589449a82eeb70638987a09572a3bd2`; tree `15b1fe6b2ac58c5821b9ab77723610d0afe780aa`. SPEC lida integralmente, `docs/HTTP-PREVIEW-SPEC-20261011.md`, SHA256 físico atual `e32244822c49fe6b248eccd15da9c9addff18a1fa6c8abd97004861de7a42d2c`, estável durante esta rechecagem. Critérios P1–P6 preservados. A referência histórica f626a302 na linha7 não foi tomada como HEAD desta verificação.

## Observações diretas e erros exatos

1. `await cua.getState();` recuperou a documentação suportada e o inventário desta execução. Resultado exato: `{"apps":[],"browsers":[]}`. O IAB2/tab3 relatado pelo processo pai não apareceu no inventário local; não foi acessado nem teve propriedade presumida.
2. Tentativa documentada de criar uma aba própria:

```javascript
await cua.createBrowserTab("iab", "http://127.0.0.1:3011/console", { visible: true });
```

Erro exato: `Error: Browser is not available: iab`. Nenhuma aba ou navegação bem-sucedida foi observada.

3. Root e console: **DOM/AX não obtido; screenshots não obtidos**. Não foram chamados getTab, captura ou interação em abas alheias. Nenhum CDP, API privada, perfil alternativo/reset/deleção ou bypass foi usado. A documentação recebida expõe opções de criação visible/sessionName; não fornece API para comprovar perfil limpo. Capacidades visibility/viewport informadas pelo pai não demonstram perfil limpo nem acesso nesta execução.

## Cobertura dos critérios imutáveis

| Critério | Resultado desta rechecagem | Evidência/limite |
|---|---|---|
| P1 | **unknown / não reavaliado** | CLI/imports/subprocesso fora do contrato desta tarefa visual; nenhuma execução HTTP adicional. |
| P2 | **unknown / não reavaliado** | Portas, origins, state isolado e ausência de gravações não exercitados aqui. |
| P3 visual | **unknown / não comprovado** | SPEC:15 exige execução não verificada, fonte explícita e painéis indisponíveis. Sem DOM/screenshots, não foi possível observar esses estados, carteira nula, modelo none, read_only, histórico vazio ou dataSource. Também não foi verificado SSE/HTTP. A indisponibilidade do navegador não demonstra defeito da UI. |
| P4 | **unknown / não reavaliado** | Nenhum teste de CORS/métodos/status/headers nesta tarefa. |
| P5 | **unknown / não reavaliado** | Lifecycle/processos não alterados nem exercitados. |
| P6 | **partial: capacidade investigada; clean-browser não comprovado** | SPEC:18 exige UI integrada visível em navegador limpo e ownership conhecido. API suportada tentou criar aba, mas browser indisponível; nenhuma evidência de perfil limpo. RED/GREEN/typecheck/revisão anteriores não reavaliados ou substituídos. |

URL de frontend fornecido: `http://127.0.0.1:3011/console`; root pretendido `http://127.0.0.1:3011/`. Não são observações de páginas carregadas. Running entry, PID/ownership e URL/porta real do backend não foram confirmados; não inferidos de um endereço ou de relato do pai.

**Parecer delimitado: evidência visual insuficiente; P3 visual e P6 permanecem abertos.** Este relatório não aprova implementação própria, ciclo completo, commit/integracão, release ou operação financeira. A missão ampla permanece incompleta. Próxima dependência verificável: disponibilizar nesta execução um navegador/aba de propriedade suportada e evidência real de perfil limpo, sem alterar perfis ou processos; então ler DOM e capturar root/console. Nenhum critério foi enfraquecido.

Skill codex-desktop-harness aplicada proporcionalmente; documentação CUA recuperada antes de uso. Fonte e artefatos anteriores preservados. Uma leitura delimitada de nomes `*preview*.md` na raiz exclusiva não retornou arquivos; nenhum relatório anterior foi reiniciado ou sobrescrito.
