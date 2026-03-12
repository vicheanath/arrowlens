function extractMessageFromRecord(record: Record<string, unknown>): string | null {
  const prioritizedKeys = [
    "message",
    "error",
    "reason",
    "details",
    "detail",
    "context",
    "suggestion",
  ];

  for (const key of prioritizedKeys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0 && trimmed !== "[object Object]") {
        return trimmed;
      }
    }
  }

  for (const key of prioritizedKeys) {
    const value = record[key];
    if (value && typeof value === "object") {
      const nested = errorToMessage(value, "");
      if (nested) return nested;
    }
  }

  return null;
}

function parseJsonMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const extracted = errorToMessage(parsed, "");
    return extracted || null;
  } catch {
    return null;
  }
}

export function errorToMessage(error: unknown, fallback = "Unexpected error"): string {
  if (error === null || error === undefined) return fallback;

  if (typeof error === "string") {
    const parsed = parseJsonMessage(error);
    if (parsed) return parsed;
    const trimmed = error.trim();
    return trimmed && trimmed !== "[object Object]" ? trimmed : fallback;
  }

  if (error instanceof Error) {
    const parsed = parseJsonMessage(error.message);
    if (parsed) return parsed;

    const msg = error.message?.trim();
    if (msg && msg !== "[object Object]") return msg;

    const extracted = extractMessageFromRecord(error as unknown as Record<string, unknown>);
    return extracted ?? fallback;
  }

  if (typeof error === "object") {
    const extracted = extractMessageFromRecord(error as Record<string, unknown>);
    if (extracted) return extracted;

    try {
      const json = JSON.stringify(error);
      return json && json !== "{}" ? json : fallback;
    } catch {
      return fallback;
    }
  }

  const primitive = String(error).trim();
  return primitive && primitive !== "[object Object]" ? primitive : fallback;
}
