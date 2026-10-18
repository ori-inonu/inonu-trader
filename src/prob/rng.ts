/**
 * Gerador pseudoaleatório com semente para a biblioteca probabilística. Puro e determinístico: mesma semente, mesma
 * sequência, em qualquer máquina. Nada aqui lê relógio, ambiente ou o gerador padrão da plataforma.
 * Algoritmo: mulberry32 (32 bits de estado), suficiente para reamostragem; não serve para criptografia.
 */

/** Uma função que devolve um número em [0, 1) a cada chamada. */
export type Rng = () => number;

/** FNV-1a de 32 bits sobre os pontos de código do texto. Usado para derivar sementes independentes por rótulo. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Semente derivada de uma semente base e de um rótulo: fluxos distintos para experimentos distintos. */
export function deriveSeed(seed: number, label: string): number {
  if (!Number.isFinite(seed)) throw new RangeError("semente inválida");
  return (hash32(`${Math.trunc(seed)}|${label}`) ^ (Math.trunc(seed) >>> 0)) >>> 0;
}

export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) throw new RangeError("semente inválida");
  let a = Math.trunc(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inteiro uniforme em [0, n). */
export function randomInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n deve ser um inteiro positivo");
  return Math.min(n - 1, Math.floor(rng() * n));
}
