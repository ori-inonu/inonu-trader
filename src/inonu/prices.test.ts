// T7.4: the price per million tokens, which the person gives and which turns the tokens the provider measured into dollars. It is kept
// in the data folder, read strictly, and never guessed: anything that is not exactly two positive numbers (or two nulls) is "no price".
// origin: synthetic_fixture, tests only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPriceStore } from "./prices";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-prices-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the price store", () => {
  test("a folder with nothing in it has no price", () => {
    expect(createPriceStore({ file: join(dir, "prices.json") }).read()).toEqual({ input: null, output: null });
  });

  test("what was written is what is read, in a new process too", () => {
    const file = join(dir, "sub", "prices.json");
    const store = createPriceStore({ file });
    expect(store.write({ input: 3, output: 15 })).toBe(true);
    expect(createPriceStore({ file }).read()).toEqual({ input: 3, output: 15 });
    expect(readdirSync(join(dir, "sub"))).toEqual(["prices.json"]); // no temporary file left behind
  });

  test("clearing writes two nulls, and the file has only the documented fields", () => {
    const file = join(dir, "prices.json");
    const store = createPriceStore({ file });
    store.write({ input: 3, output: 15 });
    store.write({ input: null, output: null });
    expect(store.read()).toEqual({ input: null, output: null });
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8"))).sort()).toEqual(["input", "output", "v"]);
  });

  test("anything off the shape is no price: broken JSON, one side, a text, zero, a negative, a huge number", () => {
    const file = join(dir, "prices.json");
    const store = createPriceStore({ file });
    for (const body of ["{nope", "null", "[]", '{"v":1,"input":3}', '{"v":1,"input":"3","output":15}', '{"v":1,"input":0,"output":15}', '{"v":1,"input":-1,"output":15}', '{"v":1,"input":1e12,"output":15}', '{"v":2,"input":3,"output":15}']) {
      writeFileSync(file, body);
      expect(store.read()).toEqual({ input: null, output: null });
    }
  });

  test("a folder that cannot be written is a false, never an exception", () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "a file where the folder should be");
    expect(createPriceStore({ file: join(blocker, "prices.json") }).write({ input: 3, output: 15 })).toBe(false);
  });
});
