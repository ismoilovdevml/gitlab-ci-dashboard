import { logger, createLogger, logError, logSecurityEvent } from '../logger';

describe('Logger', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logger.info', () => {
    it('should log info message', () => {
      logger.info('Test message');
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should log with context', () => {
      logger.info('User login', { userId: '123' });
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should sanitize sensitive data', () => {
      logger.info('User action', { password: 'secret123', userId: '456' });
      expect(consoleInfoSpy).toHaveBeenCalled();

      const logCall = consoleInfoSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).not.toContain('secret123');
      expect(JSON.stringify(logCall)).toContain('***REDACTED***');
    });
  });

  describe('logger.error', () => {
    it('should log error message', () => {
      logger.error('Error occurred');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should sanitize tokens in error context', () => {
      logger.error('API error', { token: 'secret-token', error: 'Failed' });
      expect(consoleErrorSpy).toHaveBeenCalled();

      const logCall = consoleErrorSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).not.toContain('secret-token');
    });
  });

  describe('logger.warn', () => {
    it('should log warning message', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('createLogger with prefix', () => {
    it('should create logger with prefix', () => {
      const prefixedLogger = createLogger('API');
      prefixedLogger.info('Test');

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logCall = consoleInfoSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).toContain('[API]');
    });
  });

  describe('logError helper', () => {
    it('should log Error object', () => {
      const error = new Error('Test error');
      logError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).toContain('Test error');
    });

    it('should log unknown error', () => {
      logError('String error');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).toContain('Unknown error');
    });

    it('should include context', () => {
      const error = new Error('Test error');
      logError(error, { userId: '123' });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event with prefix', () => {
      logSecurityEvent('Failed login attempt', { ip: '127.0.0.1' });

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).toContain('[SECURITY]');
      expect(JSON.stringify(logCall)).toContain('Failed login attempt');
    });

    it('should sanitize sensitive security context', () => {
      logSecurityEvent('Password reset', {
        userId: '123',
        token: 'reset-token-123'
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).not.toContain('reset-token-123');
    });
  });

  describe('Sensitive data sanitization', () => {
    it('should mask password fields', () => {
      logger.info('Test', { password: 'secret' });
      const logCall = consoleInfoSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).toContain('***REDACTED***');
    });

    it('should mask token fields', () => {
      logger.info('Test', { apiToken: 'secret' });
      const logCall = consoleInfoSpy.mock.calls[0];
      expect(JSON.stringify(logCall)).toContain('***REDACTED***');
    });

    it('should mask nested sensitive fields', () => {
      logger.info('Test', {
        user: {
          name: 'John',
          password: 'secret',
          token: 'abc123'
        }
      });
      const logCall = consoleInfoSpy.mock.calls[0];
      const logString = JSON.stringify(logCall);
      expect(logString).not.toContain('secret');
      expect(logString).not.toContain('abc123');
      expect(logString).toContain('John');
    });

    it('should handle arrays with sensitive data', () => {
      logger.info('Test', {
        users: [
          { name: 'User1', password: 'pass1' },
          { name: 'User2', password: 'pass2' }
        ]
      });
      const logCall = consoleInfoSpy.mock.calls[0];
      const logString = JSON.stringify(logCall);
      expect(logString).not.toContain('pass1');
      expect(logString).not.toContain('pass2');
    });
  });
});
