import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { documentAnnex } from "./document-annex";

const ROOT = resolve(import.meta.dir, "../..");
const contracts = [
  { legacy: "docs/JEV-LABORATORIO-DE-DECISAO.md", current: "src/lab/docs/spec.md", marker: "## Anexo: JEV-LABORATORIO-DE-DECISAO" },
  { legacy: "docs/JEV-LAB-JEV-REAL.md", current: "src/lab-jev/docs/spec.md", marker: "## Anexo: JEV-LAB-JEV-REAL" },
] as const;
const moved = new Map<string, string>(contracts.map(c => [resolve(ROOT, c.legacy), resolve(ROOT, c.current)]));
const normalize = (text: string) => text.replaceAll("\r\n", "\n").replace(/[\u00b7\u2013\u2014]/g, "-").trim();
const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

function canonicalLinks(text: string, from: string): string {
  return text.replace(/\]\(([^)\s]+)\)/g, (_match, target: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return `](${target})`;
    const [path, fragment] = target.split("#", 2);
    const absolute = resolve(dirname(from), decodeURIComponent(path!));
    const destination = moved.get(absolute) ?? absolute;
    expect(existsSync(destination)).toBe(true);
    return `](${relative(ROOT, destination).replaceAll("\\", "/")}${fragment === undefined ? "" : "#" + fragment})`;
  });
}

test.each(["\n", "\r\n"])("a complete documentary annex survives line ending %j", ending => {
  const input = ["folder introduction", "second line", "## Contract", "first paragraph", "second paragraph", ""].join(ending);
  expect(documentAnnex(input, "## Contract")).toBe("## Contract\nfirst paragraph\nsecond paragraph\n");
});

test("an absent annex marker is refused instead of silently returning a suffix", () => {
  expect(() => documentAnnex("folder introduction\r\n", "## Contract")).toThrow("annex marker");
});

for (const contract of contracts) {
  test(`the current ${contract.legacy} contract remains complete and its links resolve with LF and CRLF`, () => {
    const file = resolve(ROOT, contract.current);
    const text = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
    const expected = canonicalLinks(normalize(readFileSync(resolve(ROOT, contract.legacy), "utf8")), resolve(ROOT, contract.legacy));
    for (const variant of [text, text.replaceAll("\n", "\r\n")]) {
      const extracted = documentAnnex(variant, contract.marker);
      expect(extracted.startsWith(contract.marker + "\n\n")).toBe(true);
      const body = normalize(extracted.slice(contract.marker.length));
      expect(hash(canonicalLinks(body, file))).toBe(hash(expected));
    }
  });
}
