import type { NextConfig } from "next";
import path from "node:path";

// Desktop build (docs/sdd/inonu-desktop-v1, T1.3): INONU_EXPORT=1 emits a static site that the local core serves from the
// same origin as its APIs. Its own distDir keeps it away from the `.next` folder a running `next dev` is using. Without
// the variable nothing changes.
const exporting = process.env.INONU_EXPORT === "1";

const nextConfig: NextConfig = {
  // The repo root also has a bun.lock; pin the workspace root to this app.
  turbopack: { root: path.resolve(__dirname) },
  ...(exporting ? { output: "export" as const, distDir: process.env.INONU_EXPORT_DIR ?? "out-inonu", env: { NEXT_PUBLIC_INONU_DESKTOP: "1" } } : {}),
};

export default nextConfig;
