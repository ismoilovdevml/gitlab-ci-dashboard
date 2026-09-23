import { logger, createLogger, logError, logSecurityEvent, serializeError } from '../logger';

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

  describe('Error serialization', () => {
    function axiosLikeError() {
      const error = new Error('Request failed with status code 401') as Error & Record<string, unknown>;
      error.name = 'AxiosError';
      error.code = 'ERR_BAD_REQUEST';
      error.config = {
        url: 'https://gitlab.example.com/api/v4/projects',
        headers: { 'PRIVATE-TOKEN': 'glpat-supersecret' },
      };
      error.request = { _header: 'GET /api/v4/projects\r\nPRIVATE-TOKEN: glpat-supersecret' };
      error.response = { status: 401, headers: {}, data: {} };
      return error;
    }

    it('keeps only name, message, code and status of an error', () => {
      const serialized = serializeError(axiosLikeError());
      expect(serialized).toMatchObject({
        name: 'AxiosError',
        message: 'Request failed with status code 401',
        code: 'ERR_BAD_REQUEST',
        status: 401,
      });
      expect(serialized).not.toHaveProperty('config');
      expect(serialized).not.toHaveProperty('request');
    });

    it('omits the stack in production', () => {
      const env = process.env as Record<string, string | undefined>;
      const original = env.NODE_ENV;
      env.NODE_ENV = 'production';
      try {
        expect(serializeError(new Error('boom'))).not.toHaveProperty('stack');
      } finally {
        env.NODE_ENV = original;
      }
    });

    it('never logs request headers of an error passed as context', () => {
      logger.error('GitLab call failed', { error: axiosLikeError() });
      const logString = JSON.stringify(consoleErrorSpy.mock.calls[0]);
      expect(logString).not.toContain('glpat-supersecret');
      expect(logString).toContain('Request failed with status code 401');
    });

    it('never logs request headers in production JSON output', () => {
      const env = process.env as Record<string, string | undefined>;
      const original = env.NODE_ENV;
      env.NODE_ENV = 'production';
      try {
        logger.error('GitLab call failed', { error: axiosLikeError() });
      } finally {
        env.NODE_ENV = original;
      }
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('glpat-supersecret');
      expect(JSON.parse(output).error).toMatchObject({ message: 'Request failed with status code 401', status: 401 });
    });

    it('handles circular context without throwing', () => {
      const node: Record<string, unknown> = { name: 'node' };
      node.self = node;
      expect(() => logger.info('Cycle', { node })).not.toThrow();
      expect(JSON.stringify(consoleInfoSpy.mock.calls[0])).toContain('[Circular]');
    });

    it('still serializes objects shared by sibling keys', () => {
      const shared = { id: 'shared-1' };
      logger.info('Shared', { a: shared, b: shared });
      const logString = JSON.stringify(consoleInfoSpy.mock.calls[0]);
      expect(logString).not.toContain('[Circular]');
      expect(logString.match(/shared-1/g)).toHaveLength(2);
    });
  });
});
