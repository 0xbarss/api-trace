import { describe, it, expect } from "vitest";
import { buildAuthProfilesInput, createEmptyDraft } from "../components/AuthProfilesModal.js";

describe("AuthProfilesModal draft handling", () => {
  it("omits profiles left completely blank", () => {
    expect(buildAuthProfilesInput(createEmptyDraft())).toEqual({});
  });

  it("trims and keeps fully filled profiles", () => {
    const draft = createEmptyDraft();
    draft.primary = { name: " Tenant A ", token: " tok-a " };
    draft.secondary = { name: "Tenant B", token: "tok-b" };

    expect(buildAuthProfilesInput(draft)).toEqual({
      primary: { name: "Tenant A", token: "tok-a" },
      secondary: { name: "Tenant B", token: "tok-b" },
    });
  });

  it("rejects a profile that has a name but no token", () => {
    const draft = createEmptyDraft();
    draft.secondary = { name: "Tenant B", token: "" };

    expect(() => buildAuthProfilesInput(draft)).toThrow("Add both a name and a token for \"Second user\", or clear both.");
  });
});
