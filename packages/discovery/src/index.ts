import { parseAndDereferenceSpec } from "./parser.js";
import { normalizeOpenAPISpec } from "./normalizer.js";
import type { DiscoveredApi, ParseOptions } from "./types.js";

export * from "./types.js";
export * from "./parser.js";
export * from "./normalizer.js";

export async function discoverApi(
  input: string | Record<string, unknown>,
  options?: ParseOptions
): Promise<DiscoveredApi> {
  const dereferenced = await parseAndDereferenceSpec(input, options);
  return normalizeOpenAPISpec(dereferenced);
}
