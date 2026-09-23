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
});
