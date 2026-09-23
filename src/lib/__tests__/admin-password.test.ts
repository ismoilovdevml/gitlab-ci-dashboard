import {
  MIN_ADMIN_PASSWORD_LENGTH,
  validateAdminPassword,
} from '../../../prisma/admin-password';

describe('validateAdminPassword', () => {
  it('rejects a missing or empty password', () => {
    expect(validateAdminPassword(undefined)).toMatch(/not set/);
    expect(validateAdminPassword('')).toMatch(/not set/);
  });

  it('rejects passwords shorter than the minimum', () => {
    expect(validateAdminPassword('a'.repeat(MIN_ADMIN_PASSWORD_LENGTH - 1))).toMatch(
      /at least 12/
    );
  });

  it.each(['CHANGE_ME', 'CHANGE_ME_ADMIN_PASSWORD', 'change_me_but_long_enough'])(
    'rejects the .env.example placeholder %s',
    (value) => {
      expect(validateAdminPassword(value)).toMatch(/placeholder/);
    }
  );

  it('accepts a real password of minimum length', () => {
    expect(validateAdminPassword('a'.repeat(MIN_ADMIN_PASSWORD_LENGTH))).toBeNull();
    expect(validateAdminPassword('correct-horse-battery')).toBeNull();
  });
});
