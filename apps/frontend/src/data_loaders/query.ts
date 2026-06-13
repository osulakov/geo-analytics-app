/**
 * Run a read-only analysis query against the dev DB plugin. The server only
 * accepts SELECT statements; params are passed through as positional bindings.
 */
export async function runQuery(
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  const response = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!response.ok) {
    throw new Error(`Query failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Record<string, unknown>[];
}
