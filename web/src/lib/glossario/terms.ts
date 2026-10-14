/**
 * The glossary (UX-2): one sentence for every technical word the desk shows, in plain words for someone who has never traded.
 * Every sentence describes what the thing IS and never predicts or recommends. `annotate` finds the words in any text the desk
 * shows (the Veredito's sentences, for one) so the screen can offer the explanation next to the word, with no per string work.
 * Plain ASCII; no dash and no middle dot.
 */
export interface Term {
  readonly id: string;
  /** The ways the word appears in the texts of the desk, case ignored. */
  readonly aliases: readonly string[];
  readonly explicacao: string;
}

export const TERMS: readonly Term[] = [
  { id: "zona_demanda", aliases: ["zona de demanda"], explicacao: "Faixa de preco onde, antes, houve muita compra. Pode segurar uma queda." },
  { id: "zona_oferta", aliases: ["zona de oferta"], explicacao: "Faixa de preco onde, antes, houve muita venda. Pode segurar uma alta." },
  { id: "forca_da_zona", aliases: ["forca da zona"], explicacao: "Nota de 0 a 100 de quantos sinais independentes apontam para a zona. Descreve a zona, nao preve o preco." },
  { id: "invalidacao", aliases: ["invalidacao", "a ideia cai"], explicacao: "O preco em que a ideia deixa de valer. Se o preco passar dele, a hipotese estava errada." },
  { id: "estrutura", aliases: ["estrutura"], explicacao: "O desenho dos topos e fundos do preco. Quando ela vira, a direcao pode estar mudando." },
  { id: "liquidez", aliases: ["retirada de liquidez", "liquidez"], explicacao: "Dinheiro parado em ordens logo acima das maximas ou abaixo das minimas. O preco costuma ir ate la e, as vezes, volta." },
  { id: "absorcao", aliases: ["absorvidas", "absorvida", "absorcao"], explicacao: "Quando muita compra ou venda agressiva quase nao move o preco: alguem grande esta do outro lado." },
  { id: "delta", aliases: ["delta"], explicacao: "Compra agressiva menos venda agressiva em um periodo. Positivo, mais gente comprando a qualquer preco." },
  { id: "cvd", aliases: ["cvd"], explicacao: "A soma do delta ao longo do tempo." },
  { id: "poc", aliases: ["poc"], explicacao: "O preco onde mais se negociou na janela olhada." },
  { id: "adx", aliases: ["adx"], explicacao: "Mede a forca de uma tendencia, de 0 a 100. Acima de 25 a tendencia e clara. Nao diz se sobe ou desce." },
  { id: "atr", aliases: ["atr"], explicacao: "O tamanho tipico do movimento do preco em uma vela." },
  { id: "rsi", aliases: ["rsi"], explicacao: "Mede se o preco subiu ou caiu depressa demais. Acima de 70 esta esticado para cima, abaixo de 30 para baixo." },
  { id: "funding", aliases: ["funding"], explicacao: "Taxa que quem esta comprado ou vendido paga ao outro lado, nos contratos perpetuos." },
  { id: "spread", aliases: ["spread"], explicacao: "A diferenca entre o melhor preco de compra e o de venda. E um custo de entrar." },
  { id: "bps", aliases: ["bps"], explicacao: "Um centesimo de um por cento. 100 bps sao 1%." },
  { id: "perpetuo", aliases: ["perpetuo", "perpetuos"], explicacao: "Contrato sem vencimento que acompanha o preco e permite ganhar com a queda, mas tambem perder mais." },
  { id: "ganho_sobre_risco", aliases: ["ganho sobre risco"], explicacao: "Quanto se ganha no alvo para cada unidade que se perde se a ideia cair, ja descontados os custos." },
  { id: "tendencia", aliases: ["tendencia"], explicacao: "A direcao em que o preco vem andando no periodo olhado." },
  { id: "volatilidade", aliases: ["volatilidade"], explicacao: "O quanto o preco costuma balancar. Alta volatilidade quer dizer movimentos bruscos." },
];

export type Segment = string | { readonly term: string; readonly id: string; readonly explicacao: string };

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const byAlias = new Map<string, Term>();
for (const t of TERMS) for (const a of t.aliases) byAlias.set(a.toLowerCase(), t);
const PATTERN = new RegExp(`(?<![A-Za-z0-9])(${[...byAlias.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![A-Za-z0-9])`, "gi");

/** The explanation of a term by id, or null. */
export function explain(id: string): string | null {
  return TERMS.find((t) => t.id === id)?.explicacao ?? null;
}

/** The text cut into plain pieces and glossary words, in order, with nothing lost: the pieces joined give the text back. */
export function annotate(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(PATTERN)) {
    const term = byAlias.get(m[0].toLowerCase());
    if (term === undefined || m.index === undefined) continue;
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ term: m[0], id: term.id, explicacao: term.explicacao });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
