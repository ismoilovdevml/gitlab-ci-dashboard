import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import PwaProvider, { SW_URL } from '../PwaProvider';

const messageSW = jest.fn();
let serwist: { messageSW: jest.Mock } | null = null;
const providerProps = jest.fn();

jest.mock('@serwist/turbopack/react', () => ({
  SerwistProvider: ({ children, ...props }: { children: ReactNode }) => {
    providerProps(props);
    return <>{children}</>;
  },
  useSerwist: () => ({ serwist }),
}));

const setOnline = (value: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });

describe('PwaProvider', () => {
  beforeEach(() => {
    messageSW.mockReset().mockResolvedValue(true);
    providerProps.mockReset();
    serwist = { messageSW };
    setOnline(true);
  });

  it('registers the Serwist worker as a classic script and renders children', () => {
    render(
      <PwaProvider>
        <p>dashboard</p>
      </PwaProvider>,
    );

    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(providerProps).toHaveBeenCalledWith(
      expect.objectContaining({ swUrl: SW_URL, disable: false, options: { type: 'classic' } }),
    );
    expect(SW_URL).toBe('/serwist/sw.js');
  });

  it('asks the worker to cache the dashboard shell once it is available', () => {
    render(<PwaProvider>content</PwaProvider>);

    expect(messageSW).toHaveBeenCalledTimes(1);
    expect(messageSW).toHaveBeenCalledWith({ type: 'CACHE_URLS', payload: { urlsToCache: ['/'] } });
  });

  it('does nothing while offline or without a worker', () => {
    setOnline(false);
    render(<PwaProvider>offline</PwaProvider>);
    expect(messageSW).not.toHaveBeenCalled();

    setOnline(true);
    serwist = null;
    render(<PwaProvider>no worker</PwaProvider>);
    expect(messageSW).not.toHaveBeenCalled();
  });

  it('ignores a worker that cannot be messaged', async () => {
    messageSW.mockRejectedValue(new Error('no service worker'));
    render(<PwaProvider>content</PwaProvider>);
    await expect(messageSW.mock.results[0].value).rejects.toThrow('no service worker');
  });
});
