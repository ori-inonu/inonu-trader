# Auditoria visual e de uso

Conversa: 01a13627-77f2-7cd2-909b-5d85a8cfa1d8. Objetivo observado: revisar e corrigir a interface para usuários iniciantes e avançados, especialmente o painel inferior, Carteira e Radar.

Baseline: cópia local do web com alterações preexistentes, HEAD 00a593bcabe25dbb6d83795268533551098f645b. Inventário e hashes em docs/sdd/ui-audit-20261013/baseline-hashes.json do projeto. O integrador preserva mudanças concorrentes. Sem commit, publicação, deploy, transações ou alteração do ciclo de trading.

## Critérios congelados

- UI-1: Instâncias simultâneas do painel inferior têm IDs únicos e o painel ativo referencia sua própria aba.
- UI-2: Selecionar uma aba válida abre seu conteúdo, inclusive após recolher o painel ou ampliar o gráfico, preservando altura e preferências do gráfico. Mouse e teclado têm o mesmo comportamento.
- UI-3: Ações móveis ficam ocultas no desktop. Carteira e Radar têm conteúdo acessível por rolagem dentro do painel, com ações alcançáveis em 1440x900, 1024x768, 390x844 e 320x700. Não há corte horizontal de controles essenciais.
- UI-4: Uma lista de ativos sem cotações não anuncia dados ao vivo. A ausência de backend, extensão ou feed é apresentada sem valores fabricados.
- UI-5: Revisar visualmente Mesa, Rastreador, Central, Configurações e Doctor, registrando dimensões, falhas e limitações. Corrigir defeitos confirmados de layout ou navegação dentro do escopo.
- UI-6: Preservar contratos Jev/Kuru/Monad, não executar operações financeiras, não adicionar texto renderizado com ponto médio ou travessões nem animações pulsantes.

## Design e plano

1. Regressões Bun para transição pública de seleção, IDs ARIA simultâneos e estado vazio da lista.
2. Corrigir estado e acessibilidade do painel, conflito CSS e rolagem dos corpos. Reabrir layout completo ao escolher aba.
3. Exercitar páginas e teclado no navegador real; ajustar defeitos confirmados.
4. Rodar testes pertinentes, typecheck e build. Revisão independente em cópia isolada, baseline fixo e estes critérios.
5. Integrar apenas diferenças próprias sobre hashes compatíveis e lease disponível. Registrar pendências reais.

Design e seam: approved_by=jev_delegated. Recibo faed7cac-2601-4eaf-8f60-2865e6b1237e, Jev 1.13.0. Seleção revela painel: probabilidade 0.91, confiança 0.88. Testes transição pública e SSR mais navegador: probabilidade 0.86, confiança 0.81. Renomeação móvel teve abstenção e permanece adiada até evidência adicional. Uso conhecido: 869 tokens de entrada, 177 de saída; custo faturado desconhecido.

## Evidências iniciais

No navegador em 1440x900, ações móveis ocupam colunas de altura do gráfico e as três instâncias do painel repetem dock-tab e dock-body. Watchlist com cinco ativos sem ticker aparece Ao vivo. Fontes locais de seleção e CSS confirmam seleção que não abre o painel e corpo oculto no modo gráfico. O preview inicial teve carregamento tardio dos scripts; validar interações após hidratação.
