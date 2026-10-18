# Auditoria de interface, 13/10/2026

Correções integradas no projeto C:/Users/gabri/jev-trader. Objetivo: clareza de uso e responsividade, especialmente Carteira, Radar e painel inferior. Critérios UI-1 a UI-6 preservados em SPEC.md. Foram revisadas as cinco páginas do produto em 1440x900, 1024x768, 390x844 e 320x700; a última correção também foi verificada em 821px.

## O que mudou

- As três instâncias do painel inferior têm IDs ARIA únicos. Selecionar uma aba por mouse ou teclado reabre conteúdo recolhido; ações de Carteira e Radar também restauram o layout ao sair do modo gráfico, preservando a altura.
- Carteira e Radar permitem rolagem interna até os componentes inferiores. A grade não corta cartões nem expande o conteúdo além do painel; controles em 320px ficam disponíveis.
- Ações móveis aparecem apenas no celular. Cabeçalho e abas ocupam menos espaço em 320px. Entre 821 e 1200px, as três ações usam uma segunda linha para não cobrir o preço.
- Lista de ativos sem cotação não anuncia Ao vivo. Mensagens de fonte ausente orientam verificar Diagnóstico sem inventar estado de processo. Cabeçalho e gráfico usam a mesma origem de dados; seleção on-chain com preço ausente mantém a ausência, sem misturar uma cotação de exchange.
- A Central ganhou Voltar para Mesa, com alvo acessível e foco visível; retorno foi confirmado por clique em 320px.

## Validação

171 testes pertinentes passaram, sem falhas, com 1175 assertions em dez arquivos. O resultado foi repetido após integração no original. Typecheck original passou. Build webpack da cópia integrada e revisada passou, com TypeScript e geração das cinco páginas; o build padrão Turbopack não podia usar os links de dependências da cópia isolada, por isso webpack foi usado sem mudar a configuração do projeto.

Na suíte completa da cópia, 2472 passaram e cinco falharam. O baseline já falhava nos mesmos cinco testes: convenção SYNTHETIC_DEFAULTS do laboratório, três nomes de componentes de consulta/configuração e um estado esperado da cópia de reinício. Não são apresentados como resolvidos, e os critérios não foram alterados para fazê-los passar.

Dois revisores independentes examinaram SPEC e normas em fontes isoladas. A revisão encontrou preço coberto em 1024px; o defeito foi corrigido e ambos os revisores confirmaram o delta. A auditoria independente da integração confirmou UI-1 a UI-6 no escopo verificado, sem novos achados. Os 24 arquivos integrados conferiram por SHA256 antes e depois; mudanças concorrentes foram incorporadas apenas quando compatíveis e quatro dependências foram preservadas. Manifesto registra entrada e saída. Nenhum staging, commit, push, deploy ou operação financeira foi realizado.

O check de whitespace apontou uma linha vazia ao fim de MesaView.module.css. A mesma linha está na cópia original anterior à integração e foi preservada; esse check não é apresentado como aprovado.

Navegador real confirmou cinco páginas e rolagem/interações do painel. Após integração, o servidor original em http://127.0.0.1:3031/ confirmou preço em 1024px e Carteira/Radar em 320px. localhost:3001 continua servindo uma compilação anterior. Evidência e capturas estão em browser-matrix.md e screenshots/.

## Limites e próximo passo

Backend Inonu indisponível e carteira desconectada durante as verificações. Estados autenticados, saldos reais, decisões retornadas, extensão e execução financeira não estão certificados. Não houve alteração do ciclo Jev, Monad e Kuru. O próximo passo útil é exercitar estados visuais com backend disponível e carteira já conectada para leitura, sem enviar ordens ou alterar permissões. Nenhum ciclo ou automação foi criado para essa dependência.

Decisões técnicas foram consultadas pelo Jev Workflows e recibos locais preservados. O último ajuste de CSS teve abstenção do Jev; foi aplicado como correção reversível, sustentada pelo defeito visual e pelos critérios congelados, sem registrar aprovação humana ou do Jev. Custo faturado desconhecido permanece null.
