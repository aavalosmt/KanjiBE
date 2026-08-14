export function parsePagination(query: {
  page?: unknown;
  limit?: unknown;
}): { page: number; limit: number; skip: number } {
  const page = Math.max(1, toPositiveInt(query.page, 1));
  const limit = Math.min(100, Math.max(1, toPositiveInt(query.limit, 20)));
  return { page, limit, skip: (page - 1) * limit };
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return asString(value[0]);
  }
  return undefined;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}
