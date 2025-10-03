import { useDashboardStore } from '@/store/dashboard-store';

export function useTheme() {
  const { theme } = useDashboardStore();

  const getThemeClasses = () => {
    if (theme === 'light') {
      return {
        // Backgrounds - Apple style
        bg: 'bg-[#f5f5f7]',
        surface: 'bg-white',
        surfaceHover: 'hover:bg-[#f9f9f9]',

        // Borders - subtle and elegant
        border: 'border-[#d2d2d7]',
        borderLight: 'border-[#e5e5ea]',

        // Text - Apple typography
        textPrimary: 'text-[#1d1d1f]',
        textSecondary: 'text-[#6e6e73]',
        textMuted: 'text-[#86868b]',

        // Cards - soft shadows like iOS/macOS
        card: 'bg-white border border-[#d2d2d7]/50',
        cardHover: 'hover:border-[#d2d2d7] hover:shadow-[0_2px_16px_rgba(0,0,0,0.06)]',

        // Inputs - clean and minimal
        input: 'bg-white border-[#d2d2d7] text-[#1d1d1f] placeholder-[#86868b]',
        inputFocus: 'focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20',

        // Buttons - Apple style
        btnSecondary: 'bg-[#f5f5f7] text-[#1d1d1f] border-[#d2d2d7] hover:bg-[#e8e8ed]',

        // Sidebar - clean separation
        sidebar: 'bg-white border-r border-[#d2d2d7]/50',
        sidebarItem: 'text-[#1d1d1f] hover:bg-[#f5f5f7]',
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
