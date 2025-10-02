import { useDashboardStore } from '@/store/dashboard-store';

export function useTheme() {
  const { theme } = useDashboardStore();

  const getThemeClasses = () => {
    if (theme === 'light') {
      return {
        // Backgrounds
        bg: 'bg-gray-50',
        surface: 'bg-white',
        surfaceHover: 'hover:bg-gray-50',

        // Borders
        border: 'border-gray-200',
        borderLight: 'border-gray-300',

        // Text
        textPrimary: 'text-gray-900',
        textSecondary: 'text-gray-600',
        textMuted: 'text-gray-500',

        // Cards
        card: 'bg-white border border-gray-200',
        cardHover: 'hover:border-gray-300 hover:shadow-md',

        // Inputs
        input: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
        inputFocus: 'focus:border-orange-500 focus:ring-2 focus:ring-orange-200',

        // Buttons
        btnSecondary: 'bg-gray-100 text-gray-900 border-gray-300 hover:bg-gray-200',

        // Sidebar
        sidebar: 'bg-white border-r border-gray-200',
        sidebarItem: 'text-gray-700 hover:bg-gray-100',
        sidebarItemActive: 'bg-orange-50 text-orange-600 border-l-4 border-orange-500',
      };
    } else {
      return {
        // Backgrounds
        bg: 'bg-zinc-950',
        surface: 'bg-zinc-900',
        surfaceHover: 'hover:bg-zinc-800',

        // Borders
        border: 'border-zinc-800',
        borderLight: 'border-zinc-700',

        // Text
        textPrimary: 'text-white',
        textSecondary: 'text-zinc-400',
        textMuted: 'text-zinc-500',

        // Cards
        card: 'bg-zinc-900 border border-zinc-800',
        cardHover: 'hover:border-zinc-700',

        // Inputs
        input: 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500',
        inputFocus: 'focus:border-orange-500',

        // Buttons
        btnSecondary: 'bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700',

        // Sidebar
        sidebar: 'bg-zinc-900 border-r border-zinc-800',
        sidebarItem: 'text-zinc-400 hover:bg-zinc-800',
        sidebarItemActive: 'bg-orange-500/10 text-orange-500 border-l-4 border-orange-500',
      };
    }
  };

  return {
    theme,
    ...getThemeClasses(),
  };
}
