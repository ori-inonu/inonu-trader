# Parecer independente parcial — G14, continuação 1

**Resultado:** aceito a aritmética e a consistência do recorte DOM recebido. Nenhum novo achado P1/P2 verificável. G14 permanece parcial; este parecer não aprova G17, G01–G17 integralmente ou o objetivo inteiro.

## Escopo e independência

Revisor /root/candidate_review, sessão própria 01a12c1f-4fd5-7a61-93e6-15def4a2ea29; conversa do integrador 01a12b5f-ca2a-7ff1-a131-07933705d3e8. Não implementei o produto. Usei a cópia isolada R8c e leituras do espelho da execução, sem alterar fonte, critérios, dependências ou documentos compartilhados. O contrato é de leitura, sem sandbox imposto pelo SO. Node observado: v26.9.0. Configuração de papel não comprova modelo/tier/isolamento efetivos; custo conhecido: null.

A reprodução independente pelo navegador falhou: cua.getState() devolveu {"apps":[],"browsers":[]}; cua.getTab("2", { browser: "2" }) devolveu literalmente **Browser is not available: 2**. Não houve interação, DOM ou captura do revisor, nem rota alternativa. O integrador retomou exclusividade e coletou a evidência. A causa do acesso indisponível é desconhecida; não é defeito demonstrado do produto. Não houve nova tentativa.

## Proveniência e integridade

- Manifesto R8c: 0bf5458a1446a06dc6843e192682411ba6e058cbe7c0156aa7f802bf7fd867c0.
- Digest dos 447 arquivos de produto: 5c0949bc33e20ac9ccad02697e7ef4623ecac22a990e281c76fd7d9dea41f323.
- Conferi 447 hashes na cópia e 447 no espelho antes (2026-10-11T21:34:31.2542637Z) e depois (2026-10-11T21:51:02.392Z), sem divergência. Não repeti suítes ou a revisão integral dos 662 arquivos.
- INSTRUCAO-DO-OBJETIVO: cfa90cac735e9a838a0c4bc593276c83757905e7c5fedcd2414e499b1dad9e08; SPEC: eeb6ab8d9e4adf990600a8806bceaeb7774a5eefe1ae3bbe7daba70e590290ef, conferidos no fechamento nos dois diretórios. O critério também confere na leitura inicial.
- BROWSER-G14-CONTINUATION-1.json: 25223d41e1e4460a15d0d8629053d5b41f7f8dad08ae1292ab84b6dac32cddb6, igual na recepção, cálculo e fechamento.
- CONSOLE-G14-CONTINUATION-1.json: cd93edf0b81da298ef5081321dc670117f1f36541cc10bb5a4d3af64f197f97e, estável nas leituras. O recibo do integrador registra exit0, portas fechadas/lock ausente, execução financeira OFF e zero ciclos completos de core. Não reproduzi processos ou consultei portas.

## Método e contraste

O universo coletado pelo integrador foi de elementos **folha**, não vazios e com layout sob main, inclusive fora do viewport. Erros literais: ReferenceError: NodeFilter is not defined e TypeError: document.createTreeWalker is not a function. Texto misto em não folhas ficou fora. Os 25 grupos preservam paleta/cadeias/peso/fontes/contagens, mas não seletores, amostras de texto ou retângulos individuais da captura transitória. A coleta não é exaustiva nem foi reproduzida por mim.

Recalculei sRGB com limiar 0,04045, coeficientes 0,2126/0,7152/0,0722 e (Lmax+0,05)/(Lmin+0,05). Comparei razões sem arredondamento com 4,5:1 para texto normal e 3:1 para texto grande. Grande: ≥24px, ou ≥18⅔px com peso ≥700. Somente grupo5 (22px desktop/20px mobile, peso700; dois elementos por estado) é grande. Arredondei apenas a exibição a duas casas.

| Pedido | Cliente observado | Folhas | Ativas aprovadas | Desabilitadas separadas | Grandes ativas | Normais ativas | Falhas no recorte |
|---|---|---:|---:|---:|---:|---:|---:|
| 1440×900 | 1425×900 | 361 | 358 | 3 | 2 | 356 | 0 |
| 390×844 | 375×844 | 366 | 363 | 3 | 2 | 361 | 0 |
| 360×800 | 345×800 | 366 | 363 | 3 | 2 | 361 | 0 |

São 1.093 observações repetidas entre estados, 1.084 ativas e nove desabilitadas; não são 1.093 elementos únicos. Há oito pares ativos distintos, todos acima de 4,5:1. As três folhas desabilitadas por estado têm razão nominal 5,50:1, mas não entram nas contagens ativas nem provam interação.

| Primeiro plano | Fundo opaco informado | Razão |
|---|---|---:|
| rgb(182, 200, 220) | rgb(13, 22, 34) | 10.64:1 |
| rgb(233, 241, 250) | rgb(13, 22, 34) | 15.95:1 |
| rgb(242, 193, 78) | rgb(13, 22, 34) | 10.83:1 |
| rgb(79, 214, 232) | rgb(13, 22, 34) | 10.49:1 |
| rgb(242, 193, 78) | rgb(7, 12, 20) | 11.68:1 |
| rgb(233, 241, 250) | rgb(7, 12, 20) | 17.19:1 |
| rgb(233, 241, 250) | rgb(18, 29, 43) | 14.90:1 |
| rgb(182, 200, 220) | rgb(7, 12, 20) | 11.46:1 |

As cores fornecidas são RGB opacas, com fundo A/B/C mais próximo nas cadeias. Flags registradas: opacidade 1, imagem/filter nenhum, blend normal e conteúdo before/after nenhum. Não há alfa parcial nesses pares; ancestrais transparentes das tabelas resolvem ao painel rgb(13,22,34). Essas flags não certificam efeitos omitidos ou todos os pixels pintados. Dentro dos grupos sólidos há zero falhas/indeterminações aritméticas; a cobertura fora deles é desconhecida.

O par outline cyan rgb(79,214,232)/painel A é 10.490541944661503:1, acima de 3:1. Aceito o par cromático condicionado ao fundo informado, sem certificar foco integral. O outline é externo; fundo interno do botão não substitui o fundo adjacente. Os sete passos anteriores não preservam geometria/fundo externo. O estado posterior das tabelas não preserva toda a pintura, oclusão e clipping.

## Teclado, layout e cobertura G14

A sequência real do **integrador** tem sete passos: Tab/Shift+Tab, Enter fechando/reabrindo Configuração efetiva e Enter abrindo Leitura RPC. Os controles focados registrados têm altura 44px e focusVisible=true. Retângulos imediatos tinham y negativo durante scroll; não os tratei como prova de foco visível nem defeito. Um foco assentado foi reportado em y 428,109375; todo o percurso/clipping não foi certificado. Não reproduzi a sequência.

Nas tabelas mobile, o recibo relata foco de DIVs de rolagem pelo comportamento nativo do Chromium: capacidades 0→40→99 e histórico 0→40. Cliente 261/scrollWidth 360 dão alcance 99px; capacidades chegou ao extremo e histórico percorreu parte. TabIndex=-1 registrado não invalida o comportamento observado, mas não comprova portabilidade ou mecanismo em outros navegadores. Não inferi toque.

| Exigência | Evidência aceita e limite |
|---|---|
| Três viewports | Pedidos 1440×900/390×844/360×800; cliente 1425/375/345, diferença 15px reportada como scrollbar. Não são áreas cliente de 1440/390/360. |
| Overflow/cortes | bodyScrollWidth, document scrollWidth e clientWidth iguais nos três registros; cortes essenciais/oclusão nos descendentes não certificados. |
| Texto | Recorte sólido recalculado. 231 não folhas desktop/234 cada mobile excluídas, além de três folhas desktop sem layout. Essas contagens não são número de nós de texto omitidos. Fora de main e mapa individual não auditados. |
| Controles/foco | Par outline/painel calculado; bordas, ícones, variantes e pintura integral pendentes. |
| Teclado | Sete passos e rolagem local do integrador; percurso completo, traps, ordenação, clipping e reprodução independente pendentes. |
| Detalhes longos | Configuração/RPC e capacidades/histórico registrados; proveniência longa e todas as geometrias/textos não certificados pelo pacote comprimido. |
| Toque | Não exercitado. |
| Reduced motion | Não emulado nem exercitado. A falha do navegador do revisor não demonstra capacidade global. |
| Controles falsos/privados | Somente estados visitados; nenhum consentimento, wallet ou conta acessado. Não é auditoria de todos os controles. |

Também ficaram fora: pseudo conteúdo/imagens/gradientes/alfa parcial externos aos grupos, ícones/bordas/hover/erro e efeitos não fornecidos, como text-shadow/backdrop-filter/background-clip, clipping/oclusão completos e comportamento entre navegadores. A conclusão de cor é condicionada aos computedStyles registrados.

## Decisão e próxima verificação

Nenhum P1/P2 comprovado neste recorte. A aritmética local aceita não remove lacunas G14. Aprovação prévia das correções R1–R6 em R8 não aprova G17 ou o objetivo real completo, que ainda depende das provas wallet/Web3/app Jev e qualificação semântica declaradas. Referências posteriores de status ou novos documentos não foram revisados aqui.

Próxima verificação prioritária: toque e reduced-motion numa superfície qualificada, complementando texto misto/foco e clipping dos detalhes longos, com fonte fixa e sem wallet, consentimento, credenciais ou ações financeiras. O JSON acompanhante guarda razões integrais, grupos por estado, evidência atribuída e exclusões.

