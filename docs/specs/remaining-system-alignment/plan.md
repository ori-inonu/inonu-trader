# Plano de alinhamento

Base de integracao: main 2327a2885e9d513833a91e820b17d568be2c0303. Checkout candidato reutilizado: main-integration-review-20261017/jev-trader. Fontes originais permanecem preservadas durante a revisao.

1. Inventariar deltas de goal1 contra seu HEAD, comparando com main; separar alteracao de comentario/tipo, superficie de export e comportamento. Guardar hashes e limites da classificacao.
2. Implementar a primeira limpeza com dez substituicoes literais, em branch codex/remaining-alignment-20261018. A proposta deve rejeitar qualquer ancora ausente, repetida ou divergente da origem.
3. Rodar verificacao focada e definition of done. Parar na primeira falha. Guardar a saida real sem declarar sucesso antecipado.
4. Iniciar somente a interface local de desenvolvimento com ambiente minimo, sem .env ou credenciais; observar pelo navegador e registrar o estado real. O proxy de desenvolvimento permite somente dois GETs de revisao para o core local.
5. Revisar consolidacao API e migracao documental separadamente, com testes dos contratos e preservacao dos artefatos congelados. Antes de publicar, revisar diff completo e seguir ship-pr.
6. Investigar a amostra de frescor bloqueada com evidencias de timestamp por fonte; nao ampliar TTL para fazer o teste ficar verde.
7. Validar o agente completo com dados reais e inferencia observada em um contexto autorizado, conservando as fronteiras financeiras. Sem esse resultado o objetivo permanece aberto.

Jev tool audit_and_isolated_preview, recibo 0c082f68-364c-4144-b5e9-82cbb39b94ba, confianca 0.74. Revisao adicional: inspecionados entradas real-console e real-start, ambiente dos filhos, proxy Next, tela DevelopmentReviewView, init desktop e cliente CLI. O console independente nao atende o fluxo completo de carteira. O desktop padrao pode ler o vault e iniciar o agente; nao sera iniciado por esta tarefa. Preview apenas da interface pode mostrar indisponibilidade e nao constitui inferencia real.

Spec e plano preparados no escopo de continuidade autorizado. Nenhuma recomendacao do Jev concede autoridade financeira ou substitui os checks deterministas.
