'use client';

import { useEffect } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useDashboardStore();

  useEffect(() => {
    // Apply theme to document root
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  return <>{children}</>;
}
