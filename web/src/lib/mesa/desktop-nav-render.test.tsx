// WIN-13, AC-WIN-7, T1.11: the old observation console is not part of the installed app, so the topbar of the desktop build
// does not point at it (the core answers 404 to /console, and a link to a 404 is a broken promise). The web build for the
// developer's own server keeps the link. The build says which one it is through NEXT_PUBLIC_INONU_DESKTOP.
import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeskRail from "@/components/Desk/DeskRail";
import type { FeedChip } from "./mesa-model";

const NOW = 1_791_742_100_000;
const chips: FeedChip[] = [{ id: "okx-public-ws", label: "OKX tempo real", tone: "live", detail: null }];
const render = () => renderToStaticMarkup(<DeskRail chips={chips} skewMs={0} nowMs={NOW} />);

const before = process.env.NEXT_PUBLIC_INONU_DESKTOP;
afterEach(() => {
  if (before === undefined) delete process.env.NEXT_PUBLIC_INONU_DESKTOP;
  else process.env.NEXT_PUBLIC_INONU_DESKTOP = before;
});

describe("the topbar of the desktop build", () => {
  test("has no link to the console, neither in the bar nor in the sources popover", () => {
    process.env.NEXT_PUBLIC_INONU_DESKTOP = "1";
    const html = render();
    expect(html).not.toContain("/console");
    expect(html).not.toContain(">Central<");
    expect(html).not.toContain("Central de observacao");
    expect(html).toMatch(/<a[^>]*href="\/mesa"[^>]*aria-current="page"[^>]*>Mesa<\/a>/);
  });

  test("the developer's build keeps both links", () => {
    delete process.env.NEXT_PUBLIC_INONU_DESKTOP;
    const html = render();
    expect(html.match(/href="\/console"/g)?.length).toBe(2);
  });

  test("any other value is not the desktop build", () => {
    process.env.NEXT_PUBLIC_INONU_DESKTOP = "0";
    expect(render().match(/href="\/console"/g)?.length).toBe(2);
  });
});

describe("the Rastreador entry (RAS-1, T8.1)", () => {
  test("is in the bar of both builds, after the desk and not marked as the current page", () => {
    for (const desktop of ["1", undefined]) {
      if (desktop === undefined) delete process.env.NEXT_PUBLIC_INONU_DESKTOP;
      else process.env.NEXT_PUBLIC_INONU_DESKTOP = desktop;
      const html = render();
      expect(html).toMatch(/<a[^>]*href="\/mesa"[^>]*aria-current="page"[^>]*>Mesa<\/a><a[^>]*href="\/rastreador"[^>]*>Rastreador<\/a>/);
      expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    }
  });
});
