# Plano: SourceError

1. Reutilizar a worktree de integracao limpa, em branch propria sobre main 98c5ab0. Conferir a origem por leitura e preserva-la.
2. Mover a classe identica para source-error.ts. ask.ts importa e reexporta o construtor. Alterar somente os imports de portfolio e das seis fontes consumidoras.
3. Revisar API e diff. Rodar testes existentes de inonu e tipos, core e laboratorio com Bun sem .env. Os testes de recusas e contagem ja atravessam os modulos; nao criar testes que apenas espelhem a refatoracao.
4. Registrar resultados reais, conferir grafo append-only e diff, criar commit convencional e PR. Merge normal somente com identidade, checks e arvore conferidos.

As fontes que consomem so tipos de ask.ts deixam de importa-lo em runtime. source-ranking.ts continua dependendo das constantes RANKING_MIN e RANKING_MAX; nao se promete eliminar todos os ciclos entre modulos.
