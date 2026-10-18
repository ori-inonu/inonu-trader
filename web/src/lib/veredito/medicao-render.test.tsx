// What is being measured: the Placar sentence and the health of the recorder, in the Inonu tab. Honest when nothing is measured, and
// loud when the recorder cannot write. Nothing here asks the model. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MedicaoView } from "@/components/Veredito/MedicaoPanel";
import type { Medicao } from "./parse";

const medicao = (over: Partial<Medicao["gravador"] & object> | null = {}, texto = "Placar: 0 de 30 respostas medidas. Sem numero ate la."): Medicao => ({
  placar: { estado: "nao_medido", texto, medidas: 0, minimo: 30 },
  gravador: over === null ? null : { ligado: true, fotos: 48, resultados: 12, respostas: 2, falhasDeGravacao: 0, bytes: 1000, ...over },
});
const draw = (m: Medicao | null) => renderToStaticMarkup(<MedicaoView medicao={m} />);

describe("the measurement panel", () => {
  test("says what is measured, and that the recorder is on, in plain words", () => {
    const html = draw(medicao());
    expect(html).toContain("Medicao");
    expect(html).toContain("Placar: 0 de 30 respostas medidas. Sem numero ate la.");
    expect(html).toContain("Gravador ligado: 48 fotos do mercado, 12 resultados medidos e 2 respostas guardadas, nesta maquina.");
    expect(html).toContain('data-estado="nao_medido"');
    expect(html).not.toContain("Atencao");
  });
  test("a recorder that is off says nothing is measured, and write failures are said", () => {
    expect(draw(medicao({ ligado: false }))).toContain("Gravador desligado. Nada esta sendo medido.");
    expect(draw(medicao({ falhasDeGravacao: 3 }))).toContain("Atencao: 3 falhas ao gravar. Confira o espaco em disco.");
  });
  test("a core that did not say how the recorder is shows the Placar alone, and nothing at all draws nothing", () => {
    const html = draw(medicao(null));
    expect(html).toContain("Placar:");
    expect(html).not.toContain("Gravador");
    expect(draw(null)).toBe("");
  });
  test("plain ASCII, no dash, no middle dot", () => {
    const html = draw(medicao({ falhasDeGravacao: 1 }));
    expect(html).not.toMatch(/[\u2013\u2014\u00b7]/);
    expect(html.replace(/<[^>]+>/g, "")).toMatch(/^[\x20-\x7e]*$/);
  });
});
