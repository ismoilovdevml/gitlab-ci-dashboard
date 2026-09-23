/**
 * @jest-environment node
 */
import { POST } from '../route';
import prisma from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn(async (p: string) => `hashed:${p}`),
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

const mockCount = prisma.user.count as jest.Mock;
const mockCreate = prisma.user.create as jest.Mock;

describe('POST /api/setup', () => {
  const originalPassword = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockResolvedValue(0);
    mockCreate.mockImplementation(async ({ data }) => ({
      username: data.username,
      email: data.email,
    }));
  });

  afterAll(() => {
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  });

  it('refuses with 500 and creates nothing when ADMIN_PASSWORD is unset', async () => {
    delete process.env.ADMIN_PASSWORD;

    const res = await POST();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ADMIN_PASSWORD/);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('refuses when ADMIN_PASSWORD is shorter than 12 characters', async () => {
    process.env.ADMIN_PASSWORD = 'short-pass1'; // 11 chars

    const res = await POST();

    expect(res.status).toBe(500);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses the unedited .env.example placeholder', async () => {
    process.env.ADMIN_PASSWORD = 'CHANGE_ME_ADMIN_PASSWORD';

    const res = await POST();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/placeholder/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('never falls back to the old hardcoded default password', async () => {
    delete process.env.ADMIN_PASSWORD;

    await POST();

    expect(hashPassword).not.toHaveBeenCalledWith('Admin123Secure');
  });

  it('creates the admin with the configured password when it is long enough', async () => {
    process.env.ADMIN_PASSWORD = 'a-long-enough-pw'; // 16 chars

    const res = await POST();

    expect(res.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith('a-long-enough-pw');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data.password).toBe('hashed:a-long-enough-pw');
    expect(mockCreate.mock.calls[0][0].data.role).toBe('admin');
  });

  it('returns 400 when users already exist', async () => {
    process.env.ADMIN_PASSWORD = 'a-long-enough-pw';
    mockCount.mockResolvedValue(1);

    const res = await POST();

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
