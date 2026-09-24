import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Sidebar from '../Sidebar';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    sidebar: '',
    sidebarItem: '',
    textPrimary: '',
    textMuted: '',
  }),
}));

jest.mock('@/store/dashboard-store', () => ({
  useDashboardStore: () => ({}),
}));

jest.mock('@/lib/gitlab-api', () => ({
  getGitLabAPIAsync: jest.fn().mockResolvedValue({
    checkConnection: jest.fn().mockResolvedValue(true),
  }),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { authenticated: false } }),
    post: jest.fn().mockResolvedValue({}),
  },
}));

const MENU_LABELS = [
  'Overview',
  'Pipelines',
  'Projects',
  'Runners',
  'Analytics',
  'Artifacts',
  'Registry',
  'Alerting',
  'Settings',
];

describe('Sidebar', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve(null),
    }) as unknown as typeof fetch;
  });

  it('renders every menu item as an enabled button without a lock', async () => {
    const { container } = render(<Sidebar activeTab="overview" onTabChange={jest.fn()} />);

    for (const label of MENU_LABELS) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('title', label);
      expect(button).not.toHaveClass('cursor-not-allowed');
    }
    expect(container.querySelector('.lucide-lock')).toBeNull();

    await waitFor(() => expect(screen.getByText('Connected to GitLab')).toBeInTheDocument());
  });

  it.each(['runners', 'analytics', 'registry', 'alerting'])(
    'navigates to the %s tab when clicked',
    async (id) => {
      const onTabChange = jest.fn();
      render(<Sidebar activeTab="overview" onTabChange={onTabChange} />);

      const label = MENU_LABELS.find((l) => l.toLowerCase() === id) as string;
      fireEvent.click(screen.getByRole('button', { name: label }));

      expect(onTabChange).toHaveBeenCalledWith(id);
      await waitFor(() => expect(screen.getByText('Connected to GitLab')).toBeInTheDocument());
    },
  );

  describe('mobile drawer', () => {
    const renderSidebar = async (onTabChange = jest.fn()) => {
      render(<Sidebar activeTab="overview" onTabChange={onTabChange} />);
      await waitFor(() => expect(screen.getByText('Connected to GitLab')).toBeInTheDocument());
      return {
        onTabChange,
        menuButton: screen.getByRole('button', { name: 'Open navigation' }),
        drawer: document.getElementById('app-sidebar') as HTMLElement,
      };
    };

    it('starts closed and points the menu button at the drawer', async () => {
      const { menuButton, drawer } = await renderSidebar();

      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(menuButton).toHaveAttribute('aria-controls', 'app-sidebar');
      expect(drawer).toBeInTheDocument();
      expect(drawer).toHaveClass('max-lg:-translate-x-full', 'max-lg:invisible');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByTestId('sidebar-overlay')).toBeNull();
    });

    it('opens as a modal dialog and moves focus inside', async () => {
      const { menuButton, drawer } = await renderSidebar();

      fireEvent.click(menuButton);

      expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('dialog', { name: 'Main navigation' })).toBe(drawer);
      expect(drawer).toHaveAttribute('aria-modal', 'true');
      expect(drawer).toHaveClass('max-lg:translate-x-0');
      expect(drawer).not.toHaveClass('max-lg:invisible');
      expect(screen.getByTestId('sidebar-overlay')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus();
    });

    it('closes on Escape and returns focus to the menu button', async () => {
      const { menuButton } = await renderSidebar();

      fireEvent.click(menuButton);
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(menuButton).toHaveFocus();
    });

    it('closes on overlay click and on the close button', async () => {
      const { menuButton } = await renderSidebar();

      fireEvent.click(menuButton);
      fireEvent.click(screen.getByTestId('sidebar-overlay'));
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(menuButton).toHaveFocus();

      fireEvent.click(menuButton);
      fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(menuButton).toHaveFocus();
    });

    it('navigates and closes when a menu item is selected', async () => {
      const { menuButton, onTabChange } = await renderSidebar();

      fireEvent.click(menuButton);
      fireEvent.click(screen.getByRole('button', { name: 'Pipelines' }));

      expect(onTabChange).toHaveBeenCalledWith('pipelines');
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(menuButton).toHaveFocus();
    });

    it('traps Tab focus inside the open drawer', async () => {
      const { menuButton, drawer } = await renderSidebar();

      fireEvent.click(menuButton);
      const closeButton = screen.getByRole('button', { name: 'Close navigation' });
      const focusable = drawer.querySelectorAll<HTMLElement>('button:not([disabled])');
      const last = focusable[focusable.length - 1];

      // Shift+Tab from the first element wraps to the last one.
      expect(closeButton).toHaveFocus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();

      // Tab from the last element wraps back to the first one.
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(closeButton).toHaveFocus();

      // Focus that escaped the drawer is pulled back in.
      menuButton.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(closeButton).toHaveFocus();
    });

    it('marks the active item with aria-current', async () => {
      await renderSidebar();

      expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('button', { name: 'Pipelines' })).not.toHaveAttribute('aria-current');
    });
  });
});
