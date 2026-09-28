export function resolveJsonPath(source: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed.startsWith("$")) {
    return undefined;
  }

  const tokens = trimmed
    .slice(1)
    .match(/\.[^.[\]]+|\[\d+\]/g);

  let current: unknown = source;
  for (const token of tokens ?? []) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (token.startsWith("[")) {
      const index = Number(token.slice(1, -1));
      if (!Array.isArray(current) || Number.isNaN(index)) {
        return undefined;
      }
      current = current[index];
    } else {
      const key = token.slice(1);
      if (typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
  }

  return current;
}
