import React, { StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import WalletPanel from "../src/components/WalletPanel/WalletPanel";
import { useOkxWallet } from "../src/lib/useOkxWallet";

let root: Root | null = null;
let latest: ReturnType<typeof useOkxWallet> | null = null;
function Observer() {
  const wallet = useOkxWallet();
  useEffect(() => { latest = wallet; });
  return <output hidden id="review-hook-state">{JSON.stringify({ ready: wallet.ready, available: wallet.available, snapshot: wallet.snapshot })}</output>;
}
const api = {
  reactVersion: React.version,
  mount(strict = false) {
    if (root) throw new Error("already mounted");
    root = createRoot(document.getElementById("mount")!);
    const content = <><Observer /><WalletPanel /></>;
    flushSync(() => root!.render(strict ? <StrictMode>{content}</StrictMode> : content));
  },
  wallet() { return latest; },
  unmount() { flushSync(() => root?.unmount()); root = null; latest = null; },
};
(window as unknown as { mountedReview: typeof api }).mountedReview = api;
