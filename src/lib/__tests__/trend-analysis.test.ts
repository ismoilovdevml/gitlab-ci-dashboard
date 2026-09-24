/**
 * @jest-environment node
 */
import {
  calculateChangePercent,
  calculateTrend,
  getMultipleTrends,
  type DbClient,
} from '@/lib/trend-analysis';

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('calculateTrend', () => {
  it.each([
    [[], 'stable'],
    [[5], 'stable'],
    [[10, 10, 10, 10], 'stable'],
    [[10, 10, 20, 20], 'increasing'],
    [[20, 20, 10, 10], 'decreasing'],
    [[0, 0, 0, 0], 'stable'],
    [[0, 0, 3, 4], 'increasing'],
  ] as const)('%j → %s', (values, expected) => {
    expect(calculateTrend([...values])).toBe(expected);
  });
});

describe('calculateChangePercent', () => {
  it('is first-to-last percent change, and 0 when undefined', () => {
    expect(calculateChangePercent([50, 75])).toBe(50);
    expect(calculateChangePercent([0, 10])).toBe(0);
    expect(calculateChangePercent([10])).toBe(0);
    expect(Number.isFinite(calculateChangePercent([0, 0]))).toBe(true);
  });
});

describe('getMultipleTrends', () => {
  it('keys trends by metric name and omits metrics that fail', async () => {
    const findMany = jest.fn(async ({ where }: { where: { metric: string } }) => {
      if (where.metric === 'broken') throw new Error('db down');
      return [
        { timestamp: new Date('2026-09-01'), value: 1, metadata: null },
        { timestamp: new Date('2026-09-02'), value: 2, metadata: null },
      ];
    });
    const db = { trendData: { findMany } } as unknown as DbClient;

    const trends = await getMultipleTrends(db, ['pipeline_duration', 'broken']);

    expect(Object.keys(trends)).toEqual(['pipeline_duration']);
    expect(trends.pipeline_duration.data.map((p) => p.value)).toEqual([1, 2]);
    expect(trends.pipeline_duration.changePercent).toBe(100);
  });
});
