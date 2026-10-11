# INONU TRADER: valores finitos da carteira

O inventário distingue subtotal conhecido de valor completo. Esta correção protege a representação numérica usada pelas decisões; ela não mede saldo real ou retorno.

## Comportamento

- Se saldo e preço são finitos, mas sua multiplicação não cabe em Number, valueUsd fica null. Os operandos e o texto do saldo são preservados; carteira e rede ficam incompletas.
- Se a soma de valores conhecidos excede a faixa de Number, normalizeInventory lança Error com a mensagem exata Inventory USD total is not representable. Nenhum inventário parcial é retornado.
- Zero válido continua zero. Preço ausente ou inválido continua desconhecido; não se atribui preço de US$ 1 a um token automaticamente.
- Endereço, origem, instante, redes consultadas, ordem, saldo nativo, risco e contratos mantêm o comportamento existente. Redes ausentes continuam ausentes. Conjunto vazio preserva as convenções anteriores: subtotal 0 e valueComplete=true; isso não prova saldo global zero.
- Uma rejeição do inventário ocorre antes de leitura de candidatos, chamada ao modelo ou acesso ao executor.

## Verificação

Três regressões de overflow falharam no código original e passaram após a correção. Testes locais cobrem máximo finito, zero, somas próximas do limite, entradas inválidas, preço ausente, proveniência e a fronteira do operador. Na cópia do código atualizado: carteira, 27 testes e 324 assertions; operador, 82 testes e 717 assertions; análise de tipos, exit 0.

A suíte raiz configurada para src e scripts passou na cópia isolada: 1.452 testes, 2 testes opcionais ignorados, nenhuma falha e 875.587 verificações em 92 arquivos. Uma execução anterior coletou alvos adicionais indevidos e falhou; seus registros foram preservados separadamente. A revisão independente deve estar aprovada antes de integrar. As evidências brutas ficam no estado privado da conversa, com hashes e códigos de saída.

## Limites

Valores finitos não garantem precisão decimal exata, cotação válida ou atual, saldo global, lucro, uso seguro de alavancagem ou funcionamento por 24 horas. Arredondamento e underflow de Number mantêm as limitações existentes. A correção não consulta serviços autenticados nem movimenta fundos.

A integração compara o baseline atual, conserva os primeiros bytes originais validados e verifica cada arquivo imediatamente antes de escrever. Esse procedimento detecta conflitos observados, mas não é compare-and-swap atômico do sistema operacional.
