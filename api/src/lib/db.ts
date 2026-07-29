export function inPlaceholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(',');
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Shared by accounts/categories/users PUT handlers: when is_active flips,
// clear or stamp deleted_by/deleted_at alongside it.
export function applyActiveToggleFields(
  fields: string[],
  values: unknown[],
  isActive: boolean,
  actorId: string | null
): void {
  fields.push('is_active = ?');
  values.push(isActive ? 1 : 0);
  if (isActive) {
    fields.push('deleted_by = NULL');
    fields.push('deleted_at = NULL');
  } else {
    fields.push('deleted_by = ?');
    values.push(actorId);
    fields.push('deleted_at = unixepoch()');
  }
}

export function softDeleteStatement(
  db: D1Database,
  table: string,
  id: string,
  actorId: string | null
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE ${table}
       SET is_active = 0,
           updated_by = ?,
           deleted_by = ?,
           deleted_at = unixepoch(),
           updated_at = unixepoch()
       WHERE id = ?`
    )
    .bind(actorId, actorId, id);
}
