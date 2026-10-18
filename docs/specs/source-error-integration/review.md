# Revisao: SourceError

Escopo recortado e revisado antes da aplicacao: oito arquivos de producao alteram somente imports e a realocacao da classe; um novo modulo contem a classe identica. ask.ts reexporta o mesmo construtor, preservando os usuarios e os testes existentes. O ranking conserva as constantes da API. Sem retirada de exports, alteracoes no cliente autenticado, dependencias ou operacao.

Os testes existentes atravessam recusas de fontes e ask, validando codigos, instanceof, contagem propria ou inferida de chamadas e erros comuns. Os resultados locais estao em status.md. Nenhum teste novo espelha a implementacao. A verificacao nao certifica producao ou lucro.

Revisao adicional apos a primeira recomendacao Jev de confianca 0.5 detectou a quebra de export da origem e motivou o recorte com compatibilidade; decisao consultiva seguinte com confianca 0.96. Origem e demais worktrees preservadas.
