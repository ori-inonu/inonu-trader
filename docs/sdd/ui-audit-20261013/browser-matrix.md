# Evidência visual e de uso

Conversa 01a13627-77f2-7cd2-909b-5d85a8cfa1d8. Auditoria em Edge, navegador real, 13/10/2026. Preview isolado localhost:3002; fontes públicas OKX disponíveis, backend local de Inonu indisponível, carteira desconectada. Não foram feitas transações, conexão de carteira ou consultas Jev de produto.

| Página | Dimensões verificadas | Evidência e resultado |
| --- | --- | --- |
| Mesa | 1440x900, 1024x768, 821x768, 390x844, 320x700 | Radar e Carteira acessíveis. A aba reabre o painel recolhido e retorna do modo gráfico mantendo a altura de 26%. Seleção por teclado também reabre. Três ações no celular, sem duplicação desktop. Preço inteiro após redistribuir ações em 821 a 1200px. Rolagem da Carteira alcança Ticket de ordem e Agentic Wallet em 390 e 320px. |
| Rastreador | 1440x900, 1024x768, 390x844, 320x700 | Lista, controles e mensagem de dados indisponíveis inspecionados; rolagem móvel alcança conteúdo inferior. |
| Central | 1440x900, 1024x768, 390x844, 320x700 | Pipeline, mensagens de backend indisponível e conteúdo inferior inspecionados. Link Voltar para Mesa adicionado e navegação confirmada por clique em 320px. |
| Configurações | 1440x900, 1024x768, 390x844, 320x700 | Grupos, controles, privacidade e ações inferiores alcançáveis por rolagem; nenhuma configuração operacional alterada. |
| Doctor | 1440x900, 1024x768, 390x844, 320x700 | Diagnóstico, mensagens e retorno à Mesa inspecionados; indisponibilidade da fonte é descrita sem prometer a presença de um processo. |

Capturas válidas finais da Mesa: responsive-radar-1440.png, responsive-wallet-1024.png, responsive-wallet-821.png, responsive-chart-390.png, responsive-wallet-390.png, responsive-wallet-390-bottom.png, responsive-wallet-320-end.png, responsive-radar-320.png. Central após correção: responsive-console-320.png. Demais páginas: rastreador-1440-top.png, rastreador-1024.png, rastreador-390.png, rastreador-320.png, rastreador-320-bottom.png; console-1440.png, console-1024.png, console-390.png, console-320-end.png; settings-1440.png, settings-1440-bottom.png, settings-1024.png, settings-390.png, settings-320.png, settings-320-bottom.png; doctor-1440.png, doctor-1024.png, doctor-390.png, doctor-320.png. Todas em screenshots/ na cópia candidate.

As capturas combined-mesa-1440.png e settings-1440-end.png não contam como evidência. responsive-wallet-320-bottom.png mostra somente uma posição intermediária; a chegada ao fim está em responsive-wallet-320-end.png. A captura final-wallet-1024.png documenta o defeito de preço antes da última correção.

Limites: estados autenticados, carteira conectada, decisões retornadas pelo backend e execução financeira não foram exercitados. Não há certificação de todos os usuários, dados ou estados possíveis. Os indicadores de mercado são valores públicos do instante da captura. Ausência de fonte permanece sem valores fabricados; seleção da fonte on-chain não usa cotações de exchange como substituição implícita.

Revisão independente: spec_review e standards_review examinaram a cópia review-responsive, SPEC imutável, hashes e a correção de 1024px. Nenhum achado impeditivo novo; os limites de backend e de integração original permanecem explicitados nos pareceres.

Integração original: as 24 fontes conferiram contra o candidato e a revisão isolada, com quatro dependências concorrentes preservadas. Após integrar, 171 testes passaram e typecheck terminou com exit 0. O servidor original de desenvolvimento em http://127.0.0.1:3031/ exibiu preço completo e ações em 1024x768, abriu Carteira por Analisar carteira em 320x700, permitiu rolagem até Ticket de ordem e mostrou Radar com todas as cinco categorias dentro da largura. Capturas: integrated-wallet-1024.png, integrated-wallet-320-end.png e integrated-radar-320.png. O viewport temporário foi restaurado. O processo em localhost:3001 serve uma compilação anterior; não foi reiniciado. Uma tentativa de iniciar dev em 3003 encerrou com exit 1 ao identificar a instância existente em 3031; nenhum processo alheio foi terminado.
