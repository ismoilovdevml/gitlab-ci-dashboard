/**
 * @jest-environment node
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { CONNECT_TIMEOUT_MS, createPgAdapter, schemaFromUrl } from '../../../prisma/adapter';

jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

const PrismaPgMock = PrismaPg as unknown as jest.Mock;

describe('schemaFromUrl', () => {
  it('reads the schema query parameter', () => {
    expect(schemaFromUrl('postgresql://u:p@db:5432/app?schema=tenant_a')).toBe('tenant_a');
  });

  it('returns undefined when there is no usable schema', () => {
    expect(schemaFromUrl(undefined)).toBeUndefined();
    expect(schemaFromUrl('postgresql://u:p@db:5432/app')).toBeUndefined();
    expect(schemaFromUrl('postgresql://u:p@db:5432/app?schema=')).toBeUndefined();
    expect(schemaFromUrl('not a url')).toBeUndefined();
  });
});

describe('createPgAdapter', () => {
  beforeEach(() => PrismaPgMock.mockClear());

  it('passes the URL unchanged with a connect timeout', () => {
    const url = 'postgresql://u:p@db:5432/app?schema=public';
    createPgAdapter(url);
    expect(PrismaPgMock).toHaveBeenCalledWith(
      { connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS },
      { schema: 'public' }
    );
  });

  it('leaves the schema to the server default when the URL has none', () => {
    createPgAdapter('postgresql://u:p@db:5432/app');
    expect(PrismaPgMock.mock.calls[0][1]).toBeUndefined();
  });

  it('defaults to DATABASE_URL', () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@db:5432/fromenv';
    try {
      createPgAdapter();
      expect(PrismaPgMock.mock.calls[0][0].connectionString).toBe('postgresql://u:p@db:5432/fromenv');
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
