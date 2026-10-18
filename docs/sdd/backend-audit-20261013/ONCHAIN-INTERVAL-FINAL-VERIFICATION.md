# Verificação final isolada do intervalo

O candidato anterior foi rejeitado em OR-04 por ambas as revisões independentes. A marca ainda precedia o preparo da URL. As evidências e relatórios anteriores permanecem preservados, inclusive o desvio operacional histórico do primeiro revisor. Não qualificam o candidato novo.

Duas regressões públicas adicionais foram executadas antes da correção. URL com segunda leitura de path atrasada 80ms: 0 pass/1 fail/3 expects, intervalo 0ms. Transporte com primeira leitura de fetch atrasada 80ms: 0 pass/1 fail/3 expects, intervalo 0ms. São cenários controlados, não uma atribuição da causa da falha original LIVE.

Correção mínima: URL e função fetch vinculada ao receiver deps são preparadas após RequestInit, antes de lastSentMs. Cada tentativa, inclusive retry, marca o envio imediatamente antes da chamada preparada. As três regressões de credenciais e os critérios OR-01..04 são mantidos.

Verificação isolada: Onchain 201 pass/0 fail/783 expects/11 arquivos; tipos estritos dos quatro arquivos exit0. Fontes e logs estão fixados em evidence/onchain-interval-final-candidate.json. Nenhum critério de aceitação foi alterado.

Revisão independente deste novo candidato, integração CAS e verificação na árvore do projeto ainda pendentes. Esta evidência é offline e não atesta configuração real de credenciais, provedor, ordens, trading, ML, desempenho produtivo ou ativação Desktop.
