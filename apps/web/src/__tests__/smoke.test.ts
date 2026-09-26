import { describe, it, expect } from "vitest";
import { App } from "../App.js";

describe("Web Dashboard Workspace", () => {
  it("exports App component cleanly", () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe("function");
  });
});
