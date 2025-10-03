import { useEffect } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import axios from 'axios';

/**
 * Global config loader hook
 * Loads configuration from database on mount and updates Zustand store
 */
export function useConfigLoader() {
  const {
    setGitlabUrl,
    setGitlabToken,
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

        // Update Zustand store with database config
        if (config.url) setGitlabUrl(config.url);
        if (config.token) setGitlabToken(config.token);
        if (typeof config.autoRefresh === 'boolean') setAutoRefresh(config.autoRefresh);
        if (typeof config.refreshInterval === 'number') setRefreshInterval(config.refreshInterval);
        if (typeof config.notifyPipelineFailures === 'boolean') setNotifyPipelineFailures(config.notifyPipelineFailures);
        if (typeof config.notifyPipelineSuccess === 'boolean') setNotifyPipelineSuccess(config.notifyPipelineSuccess);
        if (config.theme) setTheme(config.theme);

        console.log('✅ Config loaded from database:', {
          url: config.url,
          hasToken: !!config.token,
          theme: config.theme,
        });
      } catch (error) {
        console.error('❌ Failed to load config from database:', error);
      }
    };

    loadConfig();
  }, [setGitlabUrl, setGitlabToken, setAutoRefresh, setRefreshInterval, setNotifyPipelineFailures, setNotifyPipelineSuccess, setTheme]);
}
