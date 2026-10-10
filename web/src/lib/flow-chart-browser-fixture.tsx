import { createRoot } from "react-dom/client";
import FlowChart from "../components/FlowChart/FlowChart";
import type { BlockEvent } from "./types";

type FlowChartFixtureWindow = Window & {
  __flowChartFixture?: { render: (event: unknown) => void };
};

const mount = document.getElementById("root");
if (!mount) throw new Error("FlowChart fixture mount element is missing");

const root = createRoot(mount);
function render(event: unknown) {
  const current = event === null ? null : event as BlockEvent;
  root.render(
    <FlowChart
      events={current ? [current] : []}
      latest={current}
      market="MON/USDC"
    />,
  );
}

(window as FlowChartFixtureWindow).__flowChartFixture = { render };
document.documentElement.dataset.flowChartFixture = "ready";
render(null);
