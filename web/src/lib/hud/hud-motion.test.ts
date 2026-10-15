// The command centre is allowed to move (the owner asked for a screen full of motion) but never to blink or pulse. This guard reads its styles and its scripts and fails on: a keyframe outside the list below, a keyframe
// that changes anything but position, rotation, scale or a dash offset (so none changes opacity, visibility or colour), a loop faster than one turn every 1.4 seconds, stepped timing, a timer faster than 200 ms,
// a frame loop outside live.ts, the animation API, a word of blinking or pulsing, and a stylesheet that does not switch the motion off for a person who asked the system for less.
// The scanner is tested on small samples first so a pass cannot be a scanner that sees nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "../..");
const ALLOWED_KEYFRAMES = new Set(["hud-spin", "hud-spin-rev", "hud-flow", "hud-flow-rev", "hud-drift", "hud-scan", "hud-scany", "hud-rise", "hud-bob", "hud-wave", "hud-drawin", "hud-growy", "hud-growx", "hud-enter", "hud-slide", "hud-sweep", "hud-tabrun", "hud-shine", "hud-rain"]);
const MOVEMENT_ONLY = /^(transform|stroke-dashoffset)$/;
const MIN_LOOP_S = 1.4;
const MIN_TIMER_MS = 200;

const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

export function scanStyle(file: string, raw: string): string[] {
  const css = strip(raw);
  const hits: string[] = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    const name = m[1]!;
    if (!ALLOWED_KEYFRAMES.has(name)) hits.push(`${file}: keyframes ${name} is not on the list`);
    for (const decl of m[2]!.matchAll(/([\w-]+)\s*:/g)) if (!MOVEMENT_ONLY.test(decl[1]!)) hits.push(`${file}: keyframes ${name} changes ${decl[1]}`);
  }
  for (const m of css.matchAll(/animation\s*:\s*([^;}"]+)/g)) {
    const value = m[1]!;
    const name = /\b(hud-[\w-]+)/.exec(value)?.[1];
    if (name === undefined && !/none/.test(value)) hits.push(`${file}: animation without a hud keyframe: ${value.trim()}`);
    else if (name !== undefined && !ALLOWED_KEYFRAMES.has(name)) hits.push(`${file}: animation ${name} is not on the list`);
    if (/\binfinite\b/.test(value)) {
      const seconds = Number(/([\d.]+)s\b/.exec(value)?.[1] ?? "0");
      if (!(seconds >= MIN_LOOP_S)) hits.push(`${file}: loop faster than ${MIN_LOOP_S} s: ${value.trim()}`);
    }
  }
  if (/steps\s*\(/.test(css)) hits.push(`${file}: stepped timing`);
  if (/\b(blink|blinking|pulse|pulsing|pulsar|piscar)\b/i.test(css)) hits.push(`${file}: blink or pulse word`);
  return hits;
}

/** The period of a timer written as a number or as a constant defined in the same file. NaN when it cannot be read. */
function periodOf(arg: string, code: string): number {
  if (/^\d/.test(arg)) return Number(arg.replace(/_/g, ""));
  const defined = new RegExp(String.raw`const\s+${arg}\s*=\s*([\d_]+)`).exec(code)?.[1];
  return defined === undefined ? NaN : Number(defined.replace(/_/g, ""));
}

export function scanCode(file: string, raw: string): string[] {
  const code = strip(raw);
  const hits: string[] = [];
  if (/\b(blink|blinking|pulse|pulsing|pulsar|piscar)\b/i.test(code)) hits.push(`${file}: blink or pulse word`);
  if (/\.animate\s*\(|new\s+Animation\s*\(/.test(code)) hits.push(`${file}: animation api`);
  if (/steps\s*\(/.test(code)) hits.push(`${file}: stepped timing`);
  for (const m of code.matchAll(/setInterval\s*\([\s\S]*?,\s*([A-Za-z_]\w*|\d[\d_]*)\s*\)/g)) {
    const arg = m[1]!;
    const n = periodOf(arg, code);
    if (!(n >= MIN_TIMER_MS)) hits.push(`${file}: timer faster than ${MIN_TIMER_MS} ms or not readable: ${arg}`);
  }
  if (/requestAnimationFrame/.test(code) && !file.endsWith("live.ts")) hits.push(`${file}: frame loop outside live.ts`);
  for (const m of code.matchAll(/animation:\s*([^;"`]+)/g)) {
    const value = m[1]!;
    const name = /\b(hud-[\w-]+)/.exec(value)?.[1];
    if (name === undefined || !ALLOWED_KEYFRAMES.has(name)) hits.push(`${file}: inline animation without a listed keyframe: ${value.trim()}`);
    if (/\binfinite\b/.test(value)) {
      const seconds = Number(/([\d.]+)s\b/.exec(value.replace(/\$\{[^}]*\}/g, "99"))?.[1] ?? "0");
      if (!(seconds >= MIN_LOOP_S)) hits.push(`${file}: inline loop faster than ${MIN_LOOP_S} s: ${value.trim()}`);
    }
  }
  for (const m of code.matchAll(/<animate(?:Motion|Transform)?\b[^>]*>/g)) {
    if (/attributeName="(opacity|visibility|display|fill|stroke)"/.test(m[0])) hits.push(`${file}: animate on ${/attributeName="(\w+)"/.exec(m[0])![1]}`);
    // a duration computed in the template is checked on the markup itself (hud.test.ts draws every tab and reads each dur)
    if (m[0].includes("${")) continue;
    const dur = Number(/dur="([\d.]+)s"/.exec(m[0])?.[1] ?? "0");
    if (!(dur >= 2)) hits.push(`${file}: animate faster than 2 s: ${m[0].slice(0, 60)}`);
  }
  return hits;
}

function* files(root: string, extensions: readonly string[]): Generator<string> {
  if (!existsSync(root)) return;
  if (statSync(root).isFile()) {
    if (extensions.some((e) => root.endsWith(e)) && !/\.test\.tsx?$/.test(root)) yield root;
    return;
  }
  for (const name of readdirSync(root)) yield* files(join(root, name), extensions);
}

describe("the scanner sees what it should", () => {
  test("a keyframe that changes opacity, an unlisted keyframe and a fast loop are caught", () => {
    expect(scanStyle("a.css", "@keyframes hud-spin { to { opacity: 0 } }")).toEqual(["a.css: keyframes hud-spin changes opacity"]);
    expect(scanStyle("a.css", "@keyframes wink { to { transform: none } }")).toEqual(["a.css: keyframes wink is not on the list"]);
    expect(scanStyle("a.css", ".x { animation: hud-spin .5s linear infinite; }")).toEqual(["a.css: loop faster than 1.4 s: hud-spin .5s linear infinite"]);
    expect(scanStyle("a.css", ".x { animation: hud-spin 38s linear infinite; }")).toEqual([]);
    expect(scanStyle("a.css", ".x { animation: hud-flow 1s steps(2) infinite; }").join("|")).toContain("stepped timing");
  });

  test("a script with a quick timer, a frame loop, a blink word or an opacity animation is caught; a comment that says so is not", () => {
    expect(scanCode("a.ts", "setInterval(tick, 50)").length).toBe(1);
    expect(scanCode("a.ts", "const CLOCK_MS = 250;\nsetInterval(() => go(), CLOCK_MS)")).toEqual([]);
    expect(scanCode("a.ts", "requestAnimationFrame(step)")).toEqual(["a.ts: frame loop outside live.ts"]);
    expect(scanCode("live.ts", "requestAnimationFrame(step)")).toEqual([]);
    expect(scanCode("a.ts", "const x = 'blink';")).toEqual(["a.ts: blink or pulse word"]);
    expect(scanCode("a.ts", "// nothing blinks or pulses here\nconst a = 1;")).toEqual([]);
    expect(scanCode("a.ts", '`<animate attributeName="opacity" dur="3s"/>`')).toEqual(["a.ts: animate on opacity"]);
    expect(scanCode("a.ts", '`<animateMotion dur="1s" path="M0 0"/>`').length).toBe(1);
    expect(scanCode("a.ts", "`<g style=\"animation:hud-scan 5s linear infinite\">`")).toEqual([]);
    expect(scanCode("a.ts", "`<g style=\"animation:spin 5s linear infinite\">`").length).toBe(1);
  });
});

describe("the command centre", () => {
  const styles = [...files(join(SRC, "components/Hud"), [".css"])];
  const scripts = [...files(join(SRC, "components/Hud"), [".ts", ".tsx"]), ...files(join(SRC, "lib/hud"), [".ts", ".tsx"])];

  test("it has files to scan", () => {
    expect(styles.length).toBeGreaterThanOrEqual(1);
    expect(scripts.length).toBeGreaterThanOrEqual(10);
  });

  test("its styles move only by position, rotation, scale and dash offset, in listed keyframes, never faster than a turn every 1.4 s", () => {
    const hits = styles.flatMap((f) => scanStyle(relative(SRC, f), readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  test("its scripts and the markup they write never blink, never run a quick timer and run no frame loop but the finite count-up", () => {
    const hits = scripts.flatMap((f) => scanCode(relative(SRC, f), readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  test("its stylesheet switches every animation off for a person who asked the system for less motion", () => {
    const css = strip(readFileSync(styles[0]!, "utf8"));
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*animation:\s*none\s*!important/);
  });

  test("the count-up ends: it asks for another frame only while the time is not up", () => {
    const body = strip(readFileSync(join(SRC, "lib/hud/live.ts"), "utf8"));
    expect(body).toMatch(/if \(now - t0 < durationMs\) raf = requestAnimationFrame\(step\)/);
    expect((body.match(/requestAnimationFrame\(/g) ?? []).length).toBe(2);
  });
});
