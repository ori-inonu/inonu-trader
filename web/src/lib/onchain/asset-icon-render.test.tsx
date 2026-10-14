// ICO-1 to ICO-3: the icon of an asset or a network is an <img> from the desk's own origin laid over the letters that were
// there before; when the picture is missing the letters stay. Nothing animated, plain ASCII.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetIcon, iconState } from "@/components/Desk/AssetIcon";

describe("AssetIcon markup", () => {
  test("an <img> from the local icon path, empty alt (the name is next to it), eager, with a fixed size", () => {
    const html = renderToStaticMarkup(<AssetIcon ccy="BTC" size={18} />);
    expect(html).toContain('src="/inonu/icon/btc"');
    expect(html).toContain('alt=""');
    expect(html).toContain('loading="eager"'); // tiny and cached for a day: lazy loading would only delay them in a pane that is not on screen yet
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="18"');
    expect(html).toContain('height="18"');
    expect(html).toContain("aria-hidden");
  });

  test("the letters stay underneath as the fallback, and are hidden from assistive technology", () => {
    const html = renderToStaticMarkup(<AssetIcon ccy="okb" fallback="XL" />);
    expect(html).toContain("XL");
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>XL<\/span>/);
  });

  test("without a usable symbol there is no <img>, only the letters when there are any", () => {
    expect(renderToStaticMarkup(<AssetIcon ccy={null} fallback="RH" />)).not.toContain("<img");
    expect(renderToStaticMarkup(<AssetIcon ccy={null} fallback="RH" />)).toContain("RH");
    expect(renderToStaticMarkup(<AssetIcon ccy={null} />)).not.toContain("<img");
  });

  test("the picture does not leave the desk's origin: the path is relative or the core's own", () => {
    expect(renderToStaticMarkup(<AssetIcon ccy="eth" />)).not.toMatch(/src="https?:\/\/(?!127\.0\.0\.1|localhost)/);
  });
});

describe("iconState", () => {
  test("pending until something happens, ok on load, failed on error", () => {
    expect(iconState("pending", "load")).toBe("ok");
    expect(iconState("pending", "error")).toBe("failed");
    expect(iconState("ok", "error")).toBe("failed");
    expect(iconState("failed", "load")).toBe("failed"); // a failure is final for this mount
  });
});

describe("rules of the interface", () => {
  test("the stylesheet has no animation and no blinking", async () => {
    const css = await Bun.file(new URL("../../components/Desk/AssetIcon.module.css", import.meta.url)).text();
    expect(css).not.toMatch(/@keyframes|animation\s*:|animation-name|transition\s*:|blink/i);
  });

  test("plain ASCII text in the markup", () => {
    const html = renderToStaticMarkup(<AssetIcon ccy="btc" fallback="BTC" />);
    expect(/^[\x20-\x7e]*$/.test(html.replace(/<[^>]*>/g, ""))).toBe(true);
  });
});
