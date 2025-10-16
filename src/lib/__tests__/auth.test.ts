import { randomBytes } from 'crypto';
import { generateSessionToken, hashPassword, verifyPassword } from '../auth';

// Mock crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

describe('Auth Utils', () => {
  describe('generateSessionToken', () => {
    it('should generate a 64-character hexadecimal token', () => {
      // Mock randomBytes to return predictable output
      const mockBuffer = Buffer.from('a'.repeat(32));
      (randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const token = generateSessionToken();

      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate unique tokens', () => {
      // Real implementation test
      jest.unmock('crypto');
      const crypto = jest.requireActual('crypto');
      (randomBytes as jest.Mock).mockImplementation(crypto.randomBytes);

      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
    });

    it('should use cryptographically secure randomBytes', () => {
      generateSessionToken();
      expect(randomBytes).toHaveBeenCalledWith(32);
    });
  });

  describe('hashPassword', () => {
    it('should hash password using bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);

      // Bcrypt hashes are 60 characters
      expect(hash).toHaveLength(60);
      expect(hash).toMatch(/^\$2[ayb]\$.{56}$/);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Different salts should produce different hashes
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });

    it('should be case sensitive', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('testpassword123!', hash);

      expect(isValid).toBe(false);
    });

    it('should reject empty password against hash', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('', hash);

      expect(isValid).toBe(false);
    });
  });
});
