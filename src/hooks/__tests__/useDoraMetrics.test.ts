import { toDoraMetrics, type DoraMetricsResponse } from '../useDoraMetrics';

const base: DoraMetricsResponse = {
  scope: 'all',
  projectId: null,
  period: '30d',
  periodStart: '2026-08-25T12:00:00.000Z',
  periodEnd: '2026-09-24T12:00:00.000Z',
  deploymentFrequency: { perDay: null, count: 0, rating: null },
  leadTime: { medianSeconds: null, averageSeconds: null, samples: 0, rating: null },
  mttr: { averageSeconds: null, recoveries: 0, rating: null },
  changeFailureRate: { rate: null, failed: 0, total: 0, rating: null },
  projects: [],
  truncated: false,
};

describe('toDoraMetrics', () => {
  it('keeps absent values null with no rating', () => {
    const metrics = toDoraMetrics(base);

    expect(metrics.map((m) => [m.value, m.rating])).toEqual([
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it.each([
    [3, '3.0', 'per day'],
    [0.5, '3.5', 'per week'],
    [0.05, '1.5', 'per month'],
  ])('formats %f deploys/day as %s %s', (perDay, value, unit) => {
    const [frequency] = toDoraMetrics({
      ...base,
      deploymentFrequency: { perDay, count: 10, rating: 'high' },
      changeFailureRate: { rate: 0, failed: 0, total: 10, rating: 'elite' },
    });

    expect(frequency).toMatchObject({ value, unit, rating: 'high', detail: '10 successful in period' });
  });

  it.each([
    [90, '2', 'min'],
    [5400, '1.5', 'hours'],
    [3 * 86400, '3.0', 'days'],
  ])('formats a %i s lead time as %s %s', (medianSeconds, value, unit) => {
    const lead = toDoraMetrics({
      ...base,
      leadTime: { medianSeconds, averageSeconds: medianSeconds, samples: 4, rating: 'high' },
    })[1];

    expect(lead).toMatchObject({ value, unit, detail: 'Median of 4' });
  });

  it('explains a missing MTTR', () => {
    const noFailures = toDoraMetrics({ ...base, changeFailureRate: { rate: 0, failed: 0, total: 5, rating: 'elite' } })[2];
    const unrecovered = toDoraMetrics({ ...base, changeFailureRate: { rate: 20, failed: 1, total: 5, rating: 'high' } })[2];

    expect(noFailures).toMatchObject({ value: null, rating: null, detail: 'No failures in period' });
    expect(unrecovered).toMatchObject({ value: null, detail: 'No recovery yet' });
  });

  it('formats MTTR and change failure rate', () => {
    const metrics = toDoraMetrics({
      ...base,
      mttr: { averageSeconds: 1800, recoveries: 1, rating: 'elite' },
      changeFailureRate: { rate: 12.5, failed: 1, total: 8, rating: 'elite' },
    });

    expect(metrics[2]).toMatchObject({ value: '30', unit: 'min', detail: '1 recovered failure' });
    expect(metrics[3]).toMatchObject({ value: '12.5', unit: '%', detail: '1 of 8 failed' });
  });
});
