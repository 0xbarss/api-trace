import { describe, it, expect } from "vitest";
import { App } from "../App.js";
import { Dialog } from "../components/Dialog.js";
import { TargetCatalog } from "../components/TargetCatalog.js";
import { TargetIngestionModal } from "../components/TargetIngestionModal.js";
import { RunVisualizer } from "../components/RunVisualizer.js";
import { EventTicker } from "../components/EventTicker.js";

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
  });
});
