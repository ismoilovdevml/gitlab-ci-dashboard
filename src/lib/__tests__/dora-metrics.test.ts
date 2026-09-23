/**
 * @jest-environment node
 */
import { createIncident, resolveIncident, trackDeployment, type DbClient } from '@/lib/dora-metrics';

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Any access to the unscoped client is a tenancy leak; fail loudly if it happens.
jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: new Proxy({}, {
    get() {
      throw new Error('unscoped prisma client used');
    },
  }),
}));

function makeDb() {
  return {
    incident: {
      create: jest.fn().mockResolvedValue({ id: 'inc-1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    deployment: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('dora-metrics writes go through the supplied scoped client', () => {
  it('createIncident uses the scoped client', async () => {
    const db = makeDb();

    const id = await createIncident(
      db as unknown as DbClient, 1, 'proj', 'down', 'high', 'production', new Date(), null
    );

    expect(id).toBe('inc-1');
    expect(db.incident.create).toHaveBeenCalledTimes(1);
  });

  it('resolveIncident cannot resolve an incident the scoped client does not see', async () => {
    const db = makeDb();
    db.incident.findFirst.mockResolvedValue(null);

    await expect(resolveIncident(db as unknown as DbClient, 'other-org-incident')).rejects.toThrow(
      'Incident not found'
    );
    expect(db.incident.update).not.toHaveBeenCalled();
  });

  it('resolveIncident updates via the scoped client when the incident is visible', async () => {
    const db = makeDb();
    db.incident.findFirst.mockResolvedValue({ id: 'inc-1', detectedAt: new Date(Date.now() - 60_000) });

    await resolveIncident(db as unknown as DbClient, 'inc-1', 'bad deploy');

    expect(db.incident.findFirst).toHaveBeenCalledWith({ where: { id: 'inc-1' } });
    expect(db.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inc-1' } })
    );
  });

  it('trackDeployment uses the scoped client', async () => {
    const db = makeDb();

    await trackDeployment(
      db as unknown as DbClient, 1, 'proj', 10, 'production', 'success', new Date(), null, 'abc', 'main', null
    );

    expect(db.deployment.create).toHaveBeenCalledTimes(1);
  });
});
