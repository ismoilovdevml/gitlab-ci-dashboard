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

  const isLoadedFromDB = useRef(false);
  const isSaving = useRef(false);

  // STEP 1: Load from database on mount (overrides localStorage)
  useEffect(() => {
    if (isLoadedFromDB.current) return;

    const loadFromDatabase = async () => {
      try {
        console.log('[UserPreferences] Fetching from database...');
        const response = await axios.get('/api/user/preferences', {
          withCredentials: true,
        });
        const dbPrefs = response.data;

        console.log('[UserPreferences] Database values:', dbPrefs);

        // Override localStorage with database values (database is source of truth)
        setTheme(dbPrefs.theme || 'dark');
        setAutoRefresh(dbPrefs.autoRefresh ?? true);
        setRefreshInterval(dbPrefs.refreshInterval || 10000);
        setNotifyPipelineFailures(dbPrefs.notifyPipelineFailures ?? true);
        setNotifyPipelineSuccess(dbPrefs.notifyPipelineSuccess ?? false);

        isLoadedFromDB.current = true;
        console.log('[UserPreferences] ✅ Loaded from database');
      } catch (error) {
        console.error('[UserPreferences] ❌ Failed to load from database:', error);
        isLoadedFromDB.current = true; // Mark as loaded even on error to allow saves
      }
    };

    loadFromDatabase();
  }, [setTheme, setAutoRefresh, setRefreshInterval, setNotifyPipelineFailures, setNotifyPipelineSuccess]);

  // STEP 2: Save to database when values change
  useEffect(() => {
    // Don't save until we've loaded from database first
    if (!isLoadedFromDB.current || isSaving.current) return;

    const saveToDatabase = async () => {
      isSaving.current = true;
      try {
        console.log('[UserPreferences] Saving to database:', {
          theme,
          autoRefresh,
          refreshInterval,
          notifyPipelineFailures,
          notifyPipelineSuccess,
        });

        await axios.put('/api/user/preferences', {
          theme,
          autoRefresh,
          refreshInterval,
          notifyPipelineFailures,
          notifyPipelineSuccess,
        }, {
          withCredentials: true,
        });

        console.log('[UserPreferences] ✅ Saved to database');
      } catch (error) {
        console.error('[UserPreferences] ❌ Failed to save to database:', error);
      } finally {
        isSaving.current = false;
      }
    };

    // Debounce: wait 1 second after last change before saving
    const timeoutId = setTimeout(saveToDatabase, 1000);
    return () => clearTimeout(timeoutId);
  }, [theme, autoRefresh, refreshInterval, notifyPipelineFailures, notifyPipelineSuccess]);
}
