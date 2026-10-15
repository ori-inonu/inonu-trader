# Revisao de interface com carteira conectada

Objetivo observado: continuar a revisao de Carteira, Radar e decisoes no desktop e no celular, com backend disponivel e carteira conectada, sem enviar ordens ou publicar mudancas.

Evidencia atual: a pagina local em 127.0.0.1:63968 identifica a carteira como conectada e a rede Ethereum. A consulta de carteira pede para conectar e mostra rede aguardando leitura. Uma resposta HTTP 404 da leitura e apresentada como prova de servidor antigo. Nenhum backend escuta nas portas 3000 ou 47321; as portas 3031 e 63968 servem a interface existente.

Escopo: corrigir estados e instrucoes contraditorias de carteira; apresentar falhas de leitura sem causas inventadas; testar a disponibilidade de um backend local seguro sem iniciar o entrypoint de trading; revisar visibilidade e controles de Carteira, Radar e decisoes em desktop e celular. Mudancas de rede, consultas ao modelo, assinatura e envio de ordens nao sao necessarios para esta revisao.

Preservar gates de consentimento, freshness, identidade e rede, contratos Jev/Monad/Kuru, arquivos concorrentes e criterios independentes. Usar copia isolada para implementar e revisar antes da integracao por hash.

Limites: backend ausente ou credenciais desconhecidas nao equivalem a funcionamento live; testes sinteticos nao certificam dados da carteira real. Documentar separadamente a evidencia real e os estados cobertos por regressao.
