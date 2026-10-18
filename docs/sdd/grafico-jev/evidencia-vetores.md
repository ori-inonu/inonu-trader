# Evidência dos vetores de referência (F3)

Data: 2026-10-12. Parte de [spec.md](spec.md), requisito P3.

## O que foi conferido e contra o quê

| Item | Contra | Resultado |
| --- | --- | --- |
| SMA 5 e 20, EMA 9, 21, 50 e 200, RSI 14, ATR 14, Bandas de Bollinger (superior, meio, inferior, %B, largura), ADX 14, +DI, -DI | **TA-Lib 0.8.1** (numpy 2.5.4, pandas 3.0.6), 300 velas sintéticas com semente fixa | concordância entre 1e-16 e 5e-13 relativos |
| MACD 12, 26, 9 | TA-Lib | concorda a menos de 9e-10 depois do transitório (índice 138 a 146), porque TA-Lib semeia a EMA12 no início da EMA26; o repositório semeia cada EMA no próprio início, como o TradingView |
| Heikin Ashi | implementação independente em pandas | idêntica (diferença 0) |
| Supertrend 10, 3 | máquina de estados independente sobre o ATR do TA-Lib, mesma direção inicial | linha e direção iguais (1e-14) |
| Renko (tijolo 1,0 e 2,5) | laço clássico com níveis de preço em ponto flutuante | mesmos 61 e 21 tijolos, abertura, fechamento e direção |
| Pivôs k = 3, correlação, beta, razão de eficiência, desvio amostral | numpy e pandas | iguais |
| RSI de Wilder | exemplo publicado de 33 fechamentos e 19 valores | os 19 valores batem em 0,01 (teste `test_matches_the_published_wilder_example`) |

Convenção da ADX: a semente segue o TA-Lib (soma dos n-1 primeiros valores e um passo de suavização já no índice n). Com a semente do livro de Wilder (soma de n valores) as fórmulas são as mesmas e só o transitório difere; isso foi verificado reproduzindo o TA-Lib a 4e-14.

## Como reproduzir

```text
python -m venv /tmp/ref && /tmp/ref/Scripts/pip install numpy pandas TA-Lib
/tmp/ref/Scripts/python python/tools/crosscheck_talib.py
cd python && python -m unittest discover -s tests -t .
python python/tools/make_vectors.py --check
```

A saída completa de `crosscheck_talib.py` nesta data (tolerância `|a-b| <= 1e-9 * max(1, |b|)`):

```text
ok   sma5                         compared= 296 defined_mismatch=0 max_abs=1.705e-13 max_rel=1.624e-15
ok   sma20                        compared= 281 defined_mismatch=0 max_abs=1.563e-13 max_rel=1.349e-15
ok   ema9                         compared= 292 defined_mismatch=0 max_abs=7.105e-14 max_rel=6.244e-16
ok   ema21                        compared= 280 defined_mismatch=0 max_abs=5.684e-14 max_rel=5.363e-16
ok   ema50                        compared= 251 defined_mismatch=0 max_abs=1.137e-13 max_rel=1.106e-15
ok   ema200                       compared= 101 defined_mismatch=0 max_abs=4.121e-13 max_rel=3.786e-15
ok   rsi14                        compared= 286 defined_mismatch=0 max_abs=3.197e-14 max_rel=1.544e-15
ok   atr14                        compared= 286 defined_mismatch=0 max_abs=4.441e-16 max_rel=4.441e-16
ok   bollinger.upper              compared= 281 defined_mismatch=0 max_abs=5.116e-13 max_rel=4.327e-15
ok   bollinger.mid                compared= 281 defined_mismatch=0 max_abs=1.563e-13 max_rel=1.349e-15
ok   bollinger.lower              compared= 281 defined_mismatch=0 max_abs=7.390e-13 max_rel=6.469e-15
ok   bollinger.percentB           compared= 281 defined_mismatch=0 max_abs=1.838e-13 max_rel=1.838e-13
ok   bollinger.width              compared= 281 defined_mismatch=0 max_abs=1.079e-14 max_rel=1.079e-14
ok   adx14                        compared= 273 defined_mismatch=0 max_abs=3.553e-14 max_rel=6.462e-16
ok   plusDi14                     compared= 286 defined_mismatch=0 max_abs=7.105e-15 max_rel=2.276e-16
ok   minusDi14                    compared= 286 defined_mismatch=0 max_abs=7.105e-15 max_rel=2.396e-16
info macd transient before index 138 for macd.line
ok   macd.line (from 138)         compared= 162 defined_mismatch=0 max_abs=8.913e-10 max_rel=8.858e-10
info macd transient before index 146 for macd.signal
ok   macd.signal (from 146)       compared= 154 defined_mismatch=0 max_abs=8.581e-10 max_rel=8.581e-10
info macd transient before index 144 for macd.hist
ok   macd.hist (from 144)         compared= 156 defined_mismatch=0 max_abs=8.713e-10 max_rel=8.713e-10
ok   heikin.open                  compared= 300 defined_mismatch=0 max_abs=0.000e+00 max_rel=0.000e+00
ok   heikin.close                 compared= 300 defined_mismatch=0 max_abs=0.000e+00 max_rel=0.000e+00
ok   heikin.high                  compared= 300 defined_mismatch=0 max_abs=0.000e+00 max_rel=0.000e+00
ok   heikin.low                   compared= 300 defined_mismatch=0 max_abs=0.000e+00 max_rel=0.000e+00
ok   supertrend.line              compared= 290 defined_mismatch=0 max_abs=1.421e-14 max_rel=1.289e-16
ok   supertrend.dir               compared= 290 defined_mismatch=0 max_abs=0.000e+00 max_rel=0.000e+00
ok   renko size=1.0 bricks=61 (independent float implementation: 61)
ok   renko size=2.5 bricks=21 (independent float implementation: 21)
ok   pivots k=3 count=30
ok   corr: -0.359426666073 vs -0.359426666073
ok   beta: -0.201015046749 vs -0.201015046749
ok   efficiency_ratio: 0.658536106107 vs 0.658536106107
ok   stdev(ddof=1)
ALL CROSS-CHECKS PASSED
```

## Limites desta evidência

- Os números são de uma série **sintética** (`origin: synthetic_fixture`); provam a aritmética, não dizem nada sobre mercado.
- O TA-Lib é o árbitro externo; ele não cobre Heikin Ashi, Supertrend, Renko, pivôs e estatísticas, que foram conferidos contra uma segunda implementação escrita de outro modo, não contra uma biblioteca.
- A implementação TypeScript ainda precisa reproduzir `web/src/lib/desk/chart/vectors/chart-vectors.v1.json`; isso é a fase F2.
