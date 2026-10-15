// T1.9 / WIN-2, WIN-10, WIN-11: the pure parts of the desktop build and static checks of the installer script.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WEB_EXPORT_ENV, compileArgs, makensisArgs, waitForExport, windowsVersion } from "./build-desktop";

const nsi = readFileSync(join(import.meta.dir, "..", "installer", "inonu.nsi"), "utf8");

describe("windowsVersion", () => {
  test("turns x.y.z into the four part version Windows resources need", () => {
    expect(windowsVersion("0.0.2")).toBe("0.0.2.0");
    expect(windowsVersion("1.12.30")).toBe("1.12.30.0");
  });

  test("refuses anything that is not three numeric parts", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "1.2.x", "", "1.2.3-beta"]) expect(() => windowsVersion(bad)).toThrow();
  });
});

describe("compileArgs", () => {
  const args = compileArgs({ entry: "src/desktop/main.ts", outfile: "dist/app/InonuTrader.exe", version: "0.0.2", icon: "web/src/app/favicon.ico" });

  test("compiles for Windows without a console and without loading .env or bunfig from the data home", () => {
    expect(args).toContain("--compile");
    expect(args).toContain("--target=bun-windows-x64");
    expect(args).toContain("--windows-hide-console");
    expect(args).toContain("--no-compile-autoload-dotenv");
    expect(args).toContain("--no-compile-autoload-bunfig");
  });

  test("stamps the product resources", () => {
    expect(args).toContain("--windows-version=0.0.2.0");
    expect(args).toContain("--windows-title=Inonu Trader");
    expect(args).toContain("--windows-icon=web/src/app/favicon.ico");
    expect(args.at(-2)).toBe("--outfile");
  });

  test("an argument list with the entry and the outfile, never a shell string", () => {
    expect(args).toContain("src/desktop/main.ts");
    expect(args.every((a) => typeof a === "string")).toBe(true);
    expect(args.at(-1)).toBe("dist/app/InonuTrader.exe");
  });
});

describe("WEB_EXPORT_ENV", () => {
  test("the static desk talks to its own origin, is flagged as the installed app, and carries no secret", () => {
    expect(WEB_EXPORT_ENV.INONU_EXPORT).toBe("1");
    expect(WEB_EXPORT_ENV.NEXT_PUBLIC_API_URL).toBe("");
    expect(WEB_EXPORT_ENV.NEXT_PUBLIC_INONU_APP).toBe("1");
    for (const [name, value] of Object.entries(WEB_EXPORT_ENV)) {
      expect(name).not.toMatch(/KEY|SECRET|PASSPHRASE|TOKEN|PRIVATE/i);
      expect(value).not.toMatch(/^[A-Za-z0-9+/_-]{24,}$/);
    }
  });
});

describe("waitForExport", () => {
  test("returns once index.html exists and the folder has stopped changing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "inonu-export-"));
    try {
      mkdirSync(join(dir, "_next"), { recursive: true });
      const late = setTimeout(() => writeFileSync(join(dir, "index.html"), "<html></html>"), 120);
      const more = setTimeout(() => writeFileSync(join(dir, "_next", "late.js"), "x".repeat(100)), 250);
      const started = Date.now();
      await waitForExport(dir, { pollMs: 40, stablePolls: 4, timeoutMs: 5_000 });
      expect(Date.now() - started).toBeGreaterThanOrEqual(250); // it waited for the late file, not just for index.html
      clearTimeout(late);
      clearTimeout(more);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gives up with a clear error when the export never appears", async () => {
    const dir = mkdtempSync(join(tmpdir(), "inonu-export-"));
    try {
      await expect(waitForExport(dir, { pollMs: 20, stablePolls: 2, timeoutMs: 200 })).rejects.toThrow(/no static export/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("makensisArgs", () => {
  test("passes version, app folder and outfile as defines", () => {
    const args = makensisArgs({ script: "installer/inonu.nsi", version: "0.0.2", appDir: "C:\\d\\app", outfile: "C:\\d\\Setup.exe", icon: "C:\\i.ico" });
    expect(args).toEqual(["/V2", "/DVERSION=0.0.2", "/DAPPDIR=C:\\d\\app", "/DOUTFILE=C:\\d\\Setup.exe", "/DICON=C:\\i.ico", "installer/inonu.nsi"]);
  });
});

describe("installer script (WIN-1, WIN-2, WIN-7, WIN-11)", () => {
  test("installs per user, without administrator", () => {
    expect(nsi).toContain("RequestExecutionLevel user");
    expect(nsi).toContain('InstallDir "$LOCALAPPDATA\\Programs\\InonuTrader"');
    expect(nsi).not.toMatch(/HKLM|\$PROGRAMFILES|SetShellVarContext\s+all/i);
  });

  test("shares nothing with the JevWIN product that is installed on this machine", () => {
    expect(nsi).not.toMatch(/jevwin|jeve-engine|com\.jevwin/i);
    expect(nsi).toContain("InonuTrader.App"); // its own AppId
  });

  test("carries no credential, key or environment variable names", () => {
    // environment variable names only: the word "secret" in a comment is harmless
    expect(nsi).not.toMatch(/OKX_[A-Z0-9_]+|TYPESAFE_[A-Z_]+|PRIVATE_KEY|_API_SECRET|_API_KEY|_API_PASSPHRASE/);
  });

  test("uninstall removes explicit files only and keeps the user's data unless asked", () => {
    expect(nsi).not.toMatch(/RMDir \/r "\$INSTDIR"/);
    expect(nsi).toContain("RMDir /r \"$INSTDIR\\web\"");
    expect(nsi).toContain('RMDir /r "$LOCALAPPDATA\\InonuTrader"'); // only after the explicit choice or /DELETEDATA
    expect(nsi).toContain("/DELETEDATA");
  });
});
