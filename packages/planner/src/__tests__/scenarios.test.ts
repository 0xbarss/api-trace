import { describe, it, expect } from "vitest";
import {
  buildCrudLifecycleScenario,
  findCrudLifecycleGroups,
  generateCrudLifecycleScenarios,
  generateTestPlan,
  type PlannerEndpointInput,
} from "../index.js";

const createSchema = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" }, quantity: { type: "integer" } },
};

function crudEndpoints(): PlannerEndpointInput[] {
  return [
    { id: "e1", method: "POST", path: "/items", authType: "bearer", requestSchema: createSchema },
    { id: "e2", method: "GET", path: "/items/{id}", authType: "bearer" },
    { id: "e3", method: "PUT", path: "/items/{id}", authType: "bearer", requestSchema: createSchema },
    { id: "e4", method: "DELETE", path: "/items/{id}", authType: "bearer" },
  ];
}

describe("CRUD lifecycle scenario generation", () => {
  it("groups a collection POST with its item routes", () => {
    const groups = findCrudLifecycleGroups(crudEndpoints());
    expect(groups).toHaveLength(1);
    expect(groups[0].basePath).toBe("/items");
    expect(groups[0].idParam).toBe("id");
  });

  it("builds create, read, update, delete, and read-after-delete steps in order", () => {
    const [scenario] = generateCrudLifecycleScenarios(crudEndpoints());
    expect(scenario.steps.map((s) => s.name)).toEqual([
      "create",
      "read_after_create",
      "update",
      "delete",
      "read_after_delete",
    ]);
    expect(scenario.steps[0].extract).toEqual({ resourceId: "$.id" });
    expect(scenario.steps[1].path).toBe("/items/{resourceId}");
    expect(scenario.steps[4].expectedStatus).toEqual([404]);
  });

  it("uses the schema to fill the create body and a string field for the update", () => {
    const [scenario] = generateCrudLifecycleScenarios(crudEndpoints());
    expect(scenario.steps[0].body).toMatchObject({ name: expect.any(String), quantity: expect.any(Number) });
    expect(scenario.steps[2].body).toEqual({ name: "updated-by-scenario" });
  });

  it("omits steps for item methods the API does not declare", () => {
    const endpoints = crudEndpoints().filter((e) => e.method === "POST" || e.method === "GET");
    const [scenario] = generateCrudLifecycleScenarios(endpoints);
    expect(scenario.steps.map((s) => s.name)).toEqual(["create", "read_after_create"]);
  });

  it("returns nothing when there is no POST collection route", () => {
    const endpoints = crudEndpoints().filter((e) => e.method !== "POST");
    expect(generateCrudLifecycleScenarios(endpoints)).toEqual([]);
  });

  it("returns nothing when the POST route has no item routes", () => {
    expect(generateCrudLifecycleScenarios([{ id: "e1", method: "POST", path: "/items" }])).toEqual([]);
  });

  it("skips nested collections whose parent id cannot be resolved", () => {
    const endpoints: PlannerEndpointInput[] = [
      { id: "e1", method: "POST", path: "/users/{userId}/notes" },
      { id: "e2", method: "GET", path: "/users/{userId}/notes/{noteId}" },
    ];
    expect(findCrudLifecycleGroups(endpoints)).toEqual([]);
  });

  it("names the scenario after the collection path", () => {
    const [group] = findCrudLifecycleGroups(crudEndpoints());
    expect(buildCrudLifecycleScenario(group).name).toBe("crud_lifecycle_items");
  });
});

describe("workflow jobs in the test plan", () => {
  const params = { runId: "r1", targetId: "t1", baseUrl: "http://localhost", endpoints: crudEndpoints() };

  it("adds one workflow job carrying the scenario", () => {
    const jobs = generateTestPlan(params).filter((j) => j.category === "workflow");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].testName).toBe("crud_lifecycle_items");
    expect(jobs[0].endpointId).toBe("e1");
    expect(jobs[0].scenario?.steps).toHaveLength(5);
  });

  it("passes auth profiles through to the workflow job", () => {
    const authProfiles = { primary: { name: "alice", token: "tok-a" } };
    const [job] = generateTestPlan({ ...params, options: { authProfiles } }).filter(
      (j) => j.category === "workflow"
    );
    expect(job.config?.authProfiles).toEqual(authProfiles);
  });

  it("leaves workflow jobs out when the category filter excludes them", () => {
    const jobs = generateTestPlan({ ...params, options: { categories: ["security"] } });
    expect(jobs.some((j) => j.category === "workflow")).toBe(false);
  });

  it("honors disabledTests by scenario name", () => {
    const jobs = generateTestPlan({ ...params, options: { disabledTests: ["crud_lifecycle_items"] } });
    expect(jobs.some((j) => j.category === "workflow")).toBe(false);
  });

  it("only includes workflow jobs when enabledTests names them", () => {
    const jobs = generateTestPlan({ ...params, options: { enabledTests: ["auth_missing_token"] } });
    expect(jobs.some((j) => j.category === "workflow")).toBe(false);
  });
});
