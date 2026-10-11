import { expect, test } from "bun:test";
import { createSystemOneLoader } from "./system-one";

test("polls cannot overlap and a disposed source cannot publish late responses", async () => {
  let finish!: (response: Response) => void;
  let calls = 0;
  const updates: unknown[] = [];
  const loader = createSystemOneLoader("http://fixture", update => updates.push(update), async () => {
    calls++;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const first = loader.load();
  await loader.load();
  expect(calls).toBe(1);
  loader.dispose();
  const count = updates.length;
  finish(new Response(null, { status: 404 }));
  await first;
  expect(updates).toHaveLength(count);
});

test("an absent cycle clears the old reading", async () => {
  const updates: unknown[] = [];
  const loader = createSystemOneLoader("http://fixture", update => updates.push(update), async () => new Response(null, { status: 404 }));
  await loader.load();
  expect(updates.at(-1)).toEqual({ status: "absent", cycle: null, ageMs: null, error: null });
  loader.dispose();
});
