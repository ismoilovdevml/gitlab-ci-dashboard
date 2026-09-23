import { useEffect } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import axios from 'axios';
import { logger } from '@/lib/logger';

/**
 * Global config loader hook
 * Loads configuration from database on mount and updates Zustand store
 * Note: GitLab URL and Token are now stored in database, not in Zustand
 */
export function useConfigLoader() {
  const {
    setAutoRefresh,
    setRefreshInterval,
    setNotifyPipelineFailures,
    setNotifyPipelineSuccess,
    setTheme,
  } = useDashboardStore();

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await axios.get('/api/config');
        const config = response.data;

        // Update Zustand store with database config (excluding url/token which are in DB)
        if (typeof config.autoRefresh === 'boolean') setAutoRefresh(config.autoRefresh);
        if (typeof config.refreshInterval === 'number') setRefreshInterval(config.refreshInterval);
        if (typeof config.notifyPipelineFailures === 'boolean') setNotifyPipelineFailures(config.notifyPipelineFailures);
        if (typeof config.notifyPipelineSuccess === 'boolean') setNotifyPipelineSuccess(config.notifyPipelineSuccess);
        if (config.theme) setTheme(config.theme);
      } catch (error) {
        logger.error('Failed to load config from database', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    loadConfig();
  }, [setAutoRefresh, setRefreshInterval, setNotifyPipelineFailures, setNotifyPipelineSuccess, setTheme]);
}
