import { buildValidBaselineBody } from "./mutation.js";
import type { PlannerEndpointInput, ScenarioDefinition } from "./types.js";

interface CrudLifecycleGroup {
  basePath: string;
  create: PlannerEndpointInput;
  read?: PlannerEndpointInput;
  update?: PlannerEndpointInput;
  remove?: PlannerEndpointInput;
  idParam: string;
}

function stripTrailingIdSegment(path: string): { basePath: string; idParam: string } | null {
  const match = path.match(/^(.*)\/\{([^}]+)\}$/);
  if (!match) {
    return null;
  }
  return { basePath: match[1], idParam: match[2] };
}

function buildCreateBody(endpoint: PlannerEndpointInput): Record<string, unknown> | undefined {
  const body = buildValidBaselineBody(endpoint.requestSchema);
  return Object.keys(body).length > 0 ? body : undefined;
}

function findUpdatableField(endpoint?: PlannerEndpointInput): string | null {
  const schema = endpoint?.requestSchema;
  if (!schema || schema["type"] !== "object") {
    return null;
  }
  const properties = (schema["properties"] as Record<string, Record<string, unknown>>) ?? {};
  const entry = Object.entries(properties).find(([, propSchema]) => propSchema?.["type"] === "string");
  return entry?.[0] ?? Object.keys(properties)[0] ?? null;
}

export function findCrudLifecycleGroups(endpoints: PlannerEndpointInput[]): CrudLifecycleGroup[] {
  const byPath = new Map<string, PlannerEndpointInput[]>();
  for (const endpoint of endpoints) {
    const list = byPath.get(endpoint.path) ?? [];
    list.push(endpoint);
    byPath.set(endpoint.path, list);
  }

  const groups: CrudLifecycleGroup[] = [];

  for (const [path, methods] of byPath) {
    const create = methods.find((e) => e.method.toUpperCase() === "POST");
    if (!create || path.includes("{")) {
      continue;
    }

    const itemMethods: PlannerEndpointInput[] = [];
    for (const [otherPath, otherEndpoints] of byPath) {
      const stripped = stripTrailingIdSegment(otherPath);
      if (stripped && stripped.basePath === path) {
        itemMethods.push(...otherEndpoints);
      }
    }
    if (itemMethods.length === 0) {
      continue;
    }

    const read = itemMethods.find((e) => e.method.toUpperCase() === "GET");
    const update = itemMethods.find((e) => ["PUT", "PATCH"].includes(e.method.toUpperCase()));
    const remove = itemMethods.find((e) => e.method.toUpperCase() === "DELETE");
    if (!read && !update && !remove) {
      continue;
    }

    const idParam = stripTrailingIdSegment((read ?? update ?? remove)!.path)!.idParam;
    groups.push({ basePath: path, create, read, update, remove, idParam });
  }

  return groups;
}

export function buildCrudLifecycleScenario(group: CrudLifecycleGroup): ScenarioDefinition {
  const idVar = "resourceId";
  const steps: ScenarioDefinition["steps"] = [
    {
      name: "create",
      method: "POST",
      path: group.create.path,
      body: buildCreateBody(group.create),
      expectedStatus: [200, 201],
      extract: { [idVar]: "$.id" },
    },
  ];

  if (group.read) {
    steps.push({
      name: "read_after_create",
      method: "GET",
      path: group.read.path.replace(`{${group.idParam}}`, `{${idVar}}`),
      expectedStatus: [200],
    });
  }

  if (group.update) {
    const field = findUpdatableField(group.update);
    steps.push({
      name: "update",
      method: group.update.method.toUpperCase(),
      path: group.update.path.replace(`{${group.idParam}}`, `{${idVar}}`),
      body: field ? { [field]: "updated-by-scenario" } : undefined,
      expectedStatus: [200, 204],
    });
  }

  if (group.remove) {
    steps.push({
      name: "delete",
      method: "DELETE",
      path: group.remove.path.replace(`{${group.idParam}}`, `{${idVar}}`),
      expectedStatus: [200, 204],
    });

    if (group.read) {
      steps.push({
        name: "read_after_delete",
        method: "GET",
        path: group.read.path.replace(`{${group.idParam}}`, `{${idVar}}`),
        expectedStatus: [404],
      });
    }
  }

  return {
    name: `crud_lifecycle_${group.basePath.replace(/\W+/g, "_").replace(/^_+|_+$/g, "")}`,
    description: `Chained create/read/update/delete lifecycle for ${group.basePath}`,
    steps,
  };
}

export function generateCrudLifecycleScenarios(endpoints: PlannerEndpointInput[]): ScenarioDefinition[] {
  return findCrudLifecycleGroups(endpoints).map(buildCrudLifecycleScenario);
}
