# Integração do delta de segurança do operador — 2026-10-11

Conversa: 01a12971-f91a-7b01-befa-dfa93eb04425. Continuação do objetivo autorizado de integrar atualizações elegíveis e entregar a central Jev. C1–C6 de CENTRAL-JEV-ACCEPTANCE.md permanecem imutáveis; não há nova autorização financeira, publicação ou implantação.

## Fontes e baseline fixos

- Main limpa: 382bde39cb21cbe94418104821c93fdbb2f73cf4; árvore igual ao candidato revisado 1c50fdfdf0f023ae6e9302aec04f8709f3c207ea.
- Novo commit finalizado: dd1ae31fe24e9ae31d2bcdcad099b07c1d46c4af, pai 4fe00c9fdbd01f2c9ef2d1933f79a3cd46d7d06b. Somente seis arquivos de src/operator; sem alteração visual.
- O delta valida contexto de modelo/decisão antes dos efeitos de execução live e encaminha o contexto completo no ciclo. Dry-run e os bloqueios financeiros existentes devem permanecer.
- A revisão independente da origem aprovou o recorte M1–M4 e registrou 99 testes afetados aprovados; a suite global da origem teve EPERM em rename do ledger. A causa permanece desconhecida. Essa aprovação não substitui a validação da integração.

## Requisitos e gates

- OI1/C1: integrar somente o commit fixo em workspace exclusivo; preservar ambos os históricos e todos os arquivos concorrentes não commitados.
- OI2/C2: nenhum efeito de cliente, signer ou persistência deve ocorrer para contexto live ausente, inválido, mock, divergente ou hold. A lista elegível completa deve chegar à validação; não basta a opção escolhida.
- OI3/C4: suite backend completa e análise de tipos da árvore combinada aprovadas. Qualquer falha real é investigada, sem remoção de asserções nem relaxamento de timeout.
- OI4/C5: revisão independente do delta combinado contra main fixa, com export isolado, sem implementar a própria mudança.
- OI5/C1/C4: main só recebe o candidato após os gates; confirmar árvore igual, limpeza e inventário final de branches. Build frontend já validado só pode ser reutilizado se seus arquivos e dependências forem idênticos por hash.

## Decisão e limites

Consulta Jev f31ff0f5-bbc4-4376-81d7-c9b72a126ab0: abstained, confiança 0.55, modelo jev-1.13.0, uso 911 input/61 output, custo desconhecido. O campo de escolha não é aprovação. local_fallback reversível: preparar apenas o commit fixo no workspace próprio e investigar com gates; fundamento explícito C1 e o pedido de integração de branches. Se falhar, preservar o candidato sem merge em main.

Prévia e navegador foram bloqueados por revisão de execução. C3 visual e C6 servido permanecem pendentes; não haverá nova tentativa ou contorno. Não usar testes de fixtures como certificação do dashboard real.

Plano mínimo: integrar na branch própria; exportar snapshot para o revisor; executar suite backend e tipos; resolver findings reais; mergear somente se aprovado; registrar hashes e pendências. O integrador é o único escritor na branch própria e main. O revisor escreve apenas seu relatório em diretório privado autorizado.
