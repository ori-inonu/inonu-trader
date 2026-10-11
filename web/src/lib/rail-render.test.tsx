import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Rail from "@/components/Rail/Rail";
import BrandMark from "@/components/BrandMark/BrandMark";
import type { Meta } from "@/lib/types";

const WALLET = "0x7F3a4c9B21e5D6f8A0b3C4D5e6F708192a3B4c5D6";

function meta(overrides: Partial<Meta> = {}): Meta {
  return {
    model: "jev-test",
    wallet: WALLET,
    dryRun: false,
    market: "MON/USDC",
    startedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("Rail rendering", () => {
  test("names the public brand mark and keeps decorative marks hidden", () => {
    const publicMark = renderToStaticMarkup(<BrandMark />);
    expect(publicMark).toContain('role="img"');
    expect(publicMark).toContain('aria-label="INONU TRADER"');
    expect(publicMark).not.toContain("JEV TRADER");

    const decorativeMark = renderToStaticMarkup(<BrandMark decorative />);
    expect(decorativeMark).toContain('aria-hidden="true"');
    expect(decorativeMark).not.toContain("aria-label=");
    expect(decorativeMark).not.toContain("role=");
  });

  test("shows the INONU TRADER wordmark", () => {
    const markup = renderToStaticMarkup(
      <Rail meta={meta()} latest={null} connection="live" uptimeText="00:01:02" />,
    );

    expect(markup).toContain("INONU TRADER");
    expect(markup).not.toContain("JEV TRADER");
  });

  test("carries the presentFeed labels through unchanged", () => {
    const live = renderToStaticMarkup(
      <Rail meta={meta({ dataSource: "Kuru" })} latest={null} connection="live" uptimeText="00:00:00" />,
    );
    expect(live).toContain("Feed conectado");
    expect(live).toContain("Fonte: Kuru");
    expect(live).toContain("Execução não verificada");
    expect(live).toContain("Modelo: jev-test");

    const dry = renderToStaticMarkup(
      <Rail meta={meta({ dryRun: true })} latest={null} connection="live" uptimeText="00:00:00" />,
    );
    expect(dry).toContain("Simulação");
  });

  test("offers the wallet for copying and disables it when there is none", () => {
    const withWallet = renderToStaticMarkup(
      <Rail meta={meta()} latest={null} connection="live" uptimeText="00:00:00" />,
    );
    expect(withWallet).toContain(`Copiar endereço ${WALLET}`);
    expect(withWallet).not.toContain("disabled");

    const withoutWallet = renderToStaticMarkup(
      <Rail meta={meta({ wallet: null })} latest={null} connection="live" uptimeText="00:00:00" />,
    );
    expect(withoutWallet).toContain("Carteira não informada");
    expect(withoutWallet).toContain("disabled");
  });

  test("shows a static reconnect notice without a pulsing indicator", () => {
    const markup = renderToStaticMarkup(
      <Rail meta={meta()} latest={null} connection="reconnecting" uptimeText="00:00:00" />,
    );

    expect(markup).toContain("Reconectando ao feed");
    expect(markup).not.toContain("animation:");
  });

  test("shows the block counter and the observed time the parent owns", () => {
    const markup = renderToStaticMarkup(
      <Rail meta={meta()} latest={null} connection="live" uptimeText="01:02:03" />,
    );

    expect(markup).toContain("Aguardando");
    expect(markup).toContain("01:02:03 observado");
  });
});
