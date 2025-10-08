import { useEffect, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import axios from 'axios';

export function useUserPreferences() {
  const {
    theme,
    autoRefresh,
    refreshInterval,
    notifyPipelineFailures,
    notifyPipelineSuccess,
    setTheme,
    setAutoRefresh,
    setRefreshInterval,
    setNotifyPipelineFailures,
    setNotifyPipelineSuccess,
  } = useDashboardStore();

  const isInitialized = useRef(false);
  const lastSavedPrefs = useRef<string>('');

  // Load preferences from database on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (isInitialized.current) return;

      try {
        const response = await axios.get('/api/user/preferences', {
          withCredentials: true, // Important for cookies
        });
        const prefs = response.data;

        console.log('[UserPreferences] Loading from database:', prefs);

        // IMPORTANT: Set these synchronously to avoid flash
        setTheme(prefs.theme || 'dark');
        setAutoRefresh(prefs.autoRefresh ?? true);
        setRefreshInterval(prefs.refreshInterval || 10000);
        setNotifyPipelineFailures(prefs.notifyPipelineFailures ?? true);
        setNotifyPipelineSuccess(prefs.notifyPipelineSuccess ?? false);

        lastSavedPrefs.current = JSON.stringify(prefs);
        isInitialized.current = true;

        console.log('[UserPreferences] Applied theme:', prefs.theme);
      } catch (error) {
        console.error('Failed to load user preferences:', error);
        // Keep Zustand defaults if loading fails
        isInitialized.current = true;
      }
    };

    loadPreferences();
  }, [setTheme, setAutoRefresh, setRefreshInterval, setNotifyPipelineFailures, setNotifyPipelineSuccess]);

  // Save preferences to database when they change (NOT activeTab - causes infinite redirect)
  useEffect(() => {
    if (!isInitialized.current) return;

    const currentPrefs = JSON.stringify({
      theme,
      autoRefresh,
      refreshInterval,
      notifyPipelineFailures,
      notifyPipelineSuccess,
    });

    // Only save if preferences actually changed
    if (currentPrefs === lastSavedPrefs.current) return;

    const savePreferences = async () => {
      try {
        await axios.put('/api/user/preferences', {
          theme,
          autoRefresh,
          refreshInterval,
          notifyPipelineFailures,
          notifyPipelineSuccess,
        }, {
          withCredentials: true, // Important for cookies
        });
        lastSavedPrefs.current = currentPrefs;
        console.log('[UserPreferences] Saved to database:', {
          theme,
          autoRefresh,
          refreshInterval,
          notifyPipelineFailures,
          notifyPipelineSuccess,
        });
      } catch (error) {
        console.error('Failed to save user preferences:', error);
      }
    };

    // Debounce saves
    const timeoutId = setTimeout(savePreferences, 500);
    return () => clearTimeout(timeoutId);
  }, [theme, autoRefresh, refreshInterval, notifyPipelineFailures, notifyPipelineSuccess]);
}
