import { DASHBOARD_STORE_VERSION, migrateDashboardState, useDashboardStore } from '@/store/dashboard-store';

const KEY = 'gitlab-dashboard-storage';

describe('dashboard store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('drops a legacy persisted GitLab token and URL on rehydrate', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          gitlabUrl: 'https://gitlab.example.com',
          gitlabToken: 'glpat-legacy-secret',
          theme: 'light',
          activeTab: 'runners',
          refreshInterval: 30000,
        },
        version: 0,
      })
    );

    await useDashboardStore.persist.rehydrate();

    const raw = localStorage.getItem(KEY) ?? '';
    expect(raw).not.toContain('glpat-legacy-secret');
    expect(raw).not.toContain('gitlabToken');
    expect(raw).not.toContain('gitlabUrl');

    const stored = JSON.parse(raw);
    expect(stored.version).toBe(DASHBOARD_STORE_VERSION);
    expect(stored.state).toMatchObject({ theme: 'light', activeTab: 'runners', refreshInterval: 30000 });

    const state = useDashboardStore.getState() as unknown as Record<string, unknown>;
    expect(state.gitlabToken).toBeUndefined();
    expect(state.theme).toBe('light');
  });

  it('persists only UI preferences', () => {
    useDashboardStore.getState().setActiveTab('pipelines');

    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(Object.keys(stored.state).sort()).toEqual(
      ['activeTab', 'autoRefresh', 'notifyPipelineFailures', 'notifyPipelineSuccess', 'refreshInterval', 'theme'].sort()
    );
  });

  it.each([null, undefined, 'x', 42])('migrates a malformed value %p to an empty state', (value) => {
    expect(migrateDashboardState(value)).toEqual({});
  });
});
