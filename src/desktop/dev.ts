/**
 * Development entry of the core, run from source with `bun --watch run src/desktop/dev.ts --no-browser --idle-ms 0 --port 3000` (the launch entry
 * "inonu-core-dev"): the same core as main.ts, with the Next dev server (hot reload, port 3001) allowed to call its APIs. It sits in this folder so the
 * repository root that main.ts derives from its own path stays right. The installed app is built from main.ts and never loads this file.
 */
import { allowDevOrigins } from "./dev-origins";

// 3001 is the Next dev server; localhost:3000 is the same core opened under the other loopback name (the preview pane opens it that way)
allowDevOrigins({ INONU_DEV_ORIGINS: process.env.INONU_DEV_ORIGINS ?? "http://127.0.0.1:3001,http://localhost:3001,http://localhost:3000" });
await import("./main");
