# Plano

Trabalho medio de validacao operacional; modelo e esforco ativos preservados, sem delegacao. Nenhuma mudanca funcional de produto planejada. Ler launcher, handlers, store, wire, core e guia instalado de export estatico antes dos comandos.

1. Revalidar branch, main, portas e ausencias de arquivos de ambiente. Registrar hashes das fontes e das configuracoes do frontend.
2. Construir o export em web/.next-t18-smoke/core-browser-validation-20261018, com flags de desktop e same-origin. Preservar a configuracao original e reconhecer somente ajustes automaticos esperados de tipos/include antes de restaura-la.
3. Iniciar um filho com ambiente minimo e home novo sob .scratch; compor launch/createDesktopHandlers/createAgentService reais, com scheduler desligado, store vazio e runtimeKey nulo. Nao invocar o entrypoint que le o vault.
4. Examinar GETs reais e abrir uma aba propria. Ler estado antes de navegar ou clicar. Somente navegacao de observacao, sem controles de carteira, configuracao ou consulta paga.
5. Encerrar o filho, preservar evidencias e conferir hashes, Git e portas. Revisar e registrar o resultado e seus limites no grafo append-only e no PR 5. Objetivo integral continua aberto se faltar evidencia operacional.
