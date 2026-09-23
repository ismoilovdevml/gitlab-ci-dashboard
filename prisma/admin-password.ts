// Lives under prisma/ because the runtime image ships this directory (for the seed)
// but not src/. Keep it dependency-free so it runs under tsx and in the Next.js bundle.

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

const PLACEHOLDER_PREFIX = 'CHANGE_ME';

/**
 * Validates the initial admin password taken from ADMIN_PASSWORD.
 * Returns an error message, or null when the password is acceptable.
 */
export function validateAdminPassword(password: string | undefined): string | null {
  if (!password) {
    return 'ADMIN_PASSWORD is not set.';
  }
  if (password.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
    return 'ADMIN_PASSWORD still has the placeholder value from .env.example; set a real password.';
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return `ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
