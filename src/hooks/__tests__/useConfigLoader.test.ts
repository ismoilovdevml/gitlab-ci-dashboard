import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { useConfigLoader } from '../useConfigLoader';
import { useDashboardStore } from '@/store/dashboard-store';
import { logger } from '@/lib/logger';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/store/dashboard-store', () => ({ useDashboardStore: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockGet = axios.get as jest.Mock;

describe('useConfigLoader', () => {
  const store = {
    setAutoRefresh: jest.fn(),
    setRefreshInterval: jest.fn(),
    setNotifyPipelineFailures: jest.fn(),
    setNotifyPipelineSuccess: jest.fn(),
    setTheme: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDashboardStore as unknown as jest.Mock).mockReturnValue(store);
  });

  it('applies the loaded config to the store without console output', async () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockResolvedValue({
      data: { autoRefresh: false, refreshInterval: 30, notifyPipelineFailures: true, notifyPipelineSuccess: false, theme: 'dark' },
    });

    renderHook(() => useConfigLoader());

    await waitFor(() => expect(store.setTheme).toHaveBeenCalledWith('dark'));
    expect(mockGet).toHaveBeenCalledWith('/api/config');
    expect(store.setAutoRefresh).toHaveBeenCalledWith(false);
    expect(store.setRefreshInterval).toHaveBeenCalledWith(30);
    expect(store.setNotifyPipelineFailures).toHaveBeenCalledWith(true);
    expect(store.setNotifyPipelineSuccess).toHaveBeenCalledWith(false);
    expect(consoleLog).not.toHaveBeenCalled();
    consoleLog.mockRestore();
  });

  it('logs a failure through the logger', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderHook(() => useConfigLoader());

    await waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      'Failed to load config from database',
      { error: 'network down' }
    ));
    expect(store.setTheme).not.toHaveBeenCalled();
  });
});
