// origin: synthetic_fixture, tests only. The morph keeps an element that is the same element, so an animation on it does not start again, and writes only what differs. A tiny stand-in for the DOM is enough for the logic.
import { describe, expect, test } from "bun:test";
import { morphChildren, syncAttributes } from "./morph";

class N {
  parent: N | null = null;
  kids: N[] = [];
  constructor(readonly nodeType: 1 | 3, readonly nodeName: string, public nodeValue: string | null = null, public attrs: Record<string, string> = {}) {}
  get childNodes(): N[] { return this.kids; }
  getAttributeNames(): string[] { return Object.keys(this.attrs); }
  hasAttribute(n: string): boolean { return Object.hasOwn(this.attrs, n); }
  getAttribute(n: string): string | null { return this.attrs[n] ?? null; }
  setAttribute(n: string, v: string): void { this.attrs[n] = v; }
  removeAttribute(n: string): void { delete this.attrs[n]; }
  appendChild(c: N): N { c.parent = this; this.kids.push(c); return c; }
  removeChild(c: N): N { this.kids = this.kids.filter((k) => k !== c); return c; }
  replaceChild(n: N, o: N): N { this.kids = this.kids.map((k) => (k === o ? n : k)); n.parent = this; return o; }
  cloneNode(): N { const c = new N(this.nodeType, this.nodeName, this.nodeValue, { ...this.attrs }); for (const k of this.kids) c.appendChild(k.cloneNode()); return c; }
}
const el = (name: string, attrs: Record<string, string> = {}, ...kids: (N | string)[]): N => { const n = new N(1, name, null, attrs); for (const k of kids) n.appendChild(typeof k === "string" ? new N(3, "#text", k) : k); return n; };
const as = (n: N): never => n as never;
const dump = (n: N): unknown => ({ n: n.nodeName, v: n.nodeValue, a: n.attrs, k: n.kids.map(dump) });

describe("the morph changes only what differs", () => {
  test("an element that is the same stays the same element, with its new attributes and its new text", () => {
    const ring = el("g", { class: "spin-c" });
    const label = el("text", { x: "10" }, "US$ 100");
    const root = el("svg", {}, ring, label);
    const next = el("svg", {}, el("g", { class: "spin-c" }), el("text", { x: "12", fill: "red" }, "US$ 101"));
    morphChildren(as(root), as(next));
    expect(root.kids[0]).toBe(ring);
    expect(root.kids[1]).toBe(label);
    expect(label.attrs).toEqual({ x: "12", fill: "red" });
    expect(label.kids[0]!.nodeValue).toBe("US$ 101");
  });

  test("an element of another kind is replaced, the extra ones are removed and the missing ones are added (as copies, not as the template's own)", () => {
    const root = el("svg", {}, el("rect"), el("circle"), el("path"));
    const tpl = el("svg", {}, el("rect"), el("line", { a: "1" }));
    morphChildren(as(root), as(tpl));
    expect(root.kids.map((k) => k.nodeName)).toEqual(["rect", "line"]);
    expect(root.kids[1]).not.toBe(tpl.kids[1]);
    const grow = el("svg", {}, el("g"));
    morphChildren(as(grow), as(el("svg", {}, el("g"), el("g", { n: "2" }), el("g", { n: "3" }))));
    expect(grow.kids).toHaveLength(3);
    expect(grow.kids[2]!.attrs).toEqual({ n: "3" });
  });

  test("attributes the template does not have are removed, and one that is equal is not touched", () => {
    const a = el("g", { class: "x", style: "--w:1px", gone: "1" });
    let writes = 0;
    const set = a.setAttribute.bind(a);
    a.setAttribute = (n, v) => { writes++; set(n, v); };
    syncAttributes(as(a), as(el("g", { class: "x", style: "--w:2px" })));
    expect(a.attrs).toEqual({ class: "x", style: "--w:2px" });
    expect(writes).toBe(1);
  });

  test("the same drawing again changes nothing at all", () => {
    const build = (): N => el("svg", {}, el("g", { class: "enter" }, el("text", { x: "1" }, "A"), el("rect", { width: "5" })));
    const root = build();
    const before = JSON.stringify(dump(root));
    morphChildren(as(root), as(build()));
    expect(JSON.stringify(dump(root))).toBe(before);
  });
});
