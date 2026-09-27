import { describe, it, expect } from "vitest";
import { App } from "../App.js";
import { Dialog } from "../components/Dialog.js";
import { TargetCatalog } from "../components/TargetCatalog.js";
import { TargetIngestionModal } from "../components/TargetIngestionModal.js";
import { RunVisualizer } from "../components/RunVisualizer.js";
import { EventTicker } from "../components/EventTicker.js";
import { FindingsView } from "../components/FindingsView.js";
import { FindingModal } from "../components/FindingModal.js";
import { EndpointScorecard } from "../components/EndpointScorecard.js";
import { LatencyDistribution } from "../components/LatencyDistribution.js";

describe("Web Dashboard Workspace", () => {
  it("exports App component cleanly", () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe("function");
  });

  it("exports Dialog, TargetCatalog, and TargetIngestionModal cleanly", () => {
    expect(Dialog).toBeDefined();
    expect(typeof Dialog).toBe("function");
    expect(TargetCatalog).toBeDefined();
    expect(typeof TargetCatalog).toBe("function");
    expect(TargetIngestionModal).toBeDefined();
    expect(typeof TargetIngestionModal).toBe("function");
    expect(RunVisualizer).toBeDefined();
    expect(typeof RunVisualizer).toBe("function");
    expect(EventTicker).toBeDefined();
    expect(typeof EventTicker).toBe("function");
    expect(FindingsView).toBeDefined();
    expect(typeof FindingsView).toBe("function");
    expect(FindingModal).toBeDefined();
    expect(typeof FindingModal).toBe("function");
    expect(EndpointScorecard).toBeDefined();
    expect(typeof EndpointScorecard).toBe("function");
    expect(LatencyDistribution).toBeDefined();
    expect(typeof LatencyDistribution).toBe("function");
  });
});
