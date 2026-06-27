// Vitest stub for lib/auth/admin-access — not needed in pure unit tests.
export async function isAdmin(
  _user: { id: string; email?: string | null } | null,
): Promise<boolean> {
  return false;
}
