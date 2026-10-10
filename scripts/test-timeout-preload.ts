/**
 * Central per-test timeout for `bun test`, wired in from `bunfig.toml` through the `[test] preload` key.
 *
 * Bun 1.3.x accepts `timeout` and `testTimeout` under the `[test]` section of bunfig.toml without
 * reporting an error and then ignores both, leaving the 5000ms default in place. Calling
 * `setDefaultTimeout` from the preload alone is not enough either: it only reaches the test file
 * Bun happens to load last, so every other file keeps timing out at 5000ms. The loader below is
 * what makes the setting real: it prepends the same call to every test module, so each file raises
 * its own default before any `test` in it is registered.
 *
 * `package.json` `scripts.test` passes the identical value through the `--timeout` flag, so the
 * script entry point and a bare `bun test` agree on 15000ms. Raise both together.
 *
 * This file is tracked on purpose: a preload that resolves to a gitignored path makes `bun test`
 * abort with "preload not found" on every fresh clone.
 */
import { plugin } from "bun";
import { setDefaultTimeout } from "bun:test";

/** Must equal the `--timeout` value in the package.json `test` script. */
export const REPO_TEST_TIMEOUT_MS = 15000;

setDefaultTimeout(REPO_TEST_TIMEOUT_MS);

plugin({
  name: "repo-test-timeout",
  setup(build) {
    build.onLoad({ filter: /\.test\.ts$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const preamble = `import { setDefaultTimeout as __repoSetDefaultTimeout } from "bun:test";\n__repoSetDefaultTimeout(${REPO_TEST_TIMEOUT_MS});\n`;
      return { contents: preamble + source, loader: "ts" };
    });
  },
});