import {
  GitLabUrlError,
  isSameOrigin,
  normalizeGitLabBaseUrl,
  resolveRedirectUrl,
} from '@/lib/gitlab/url';

describe('normalizeGitLabBaseUrl', () => {
  it('accepts http and https and strips trailing slashes', () => {
    expect(normalizeGitLabBaseUrl('https://gitlab.com/')).toBe('https://gitlab.com');
    expect(normalizeGitLabBaseUrl('  http://192.168.1.10:8080//  ')).toBe('http://192.168.1.10:8080');
  });

  it('keeps a relative root path', () => {
    expect(normalizeGitLabBaseUrl('https://git.example.com/gitlab/')).toBe('https://git.example.com/gitlab');
  });

  it('lowercases the host', () => {
    expect(normalizeGitLabBaseUrl('https://GitLab.Example.COM')).toBe('https://gitlab.example.com');
  });

  it.each([
    ['file:///etc/passwd'],
    ['ftp://gitlab.example.com'],
    ['javascript:alert(1)'],
    ['gopher://gitlab.example.com'],
  ])('rejects non-http scheme %s', (url) => {
    expect(() => normalizeGitLabBaseUrl(url)).toThrow(GitLabUrlError);
  });

  it('rejects credentials in the URL', () => {
    expect(() => normalizeGitLabBaseUrl('https://user:pass@gitlab.example.com')).toThrow(/credentials/);
  });

  it('rejects query strings and fragments', () => {
    expect(() => normalizeGitLabBaseUrl('https://gitlab.example.com?x=1')).toThrow(GitLabUrlError);
    expect(() => normalizeGitLabBaseUrl('https://gitlab.example.com#frag')).toThrow(GitLabUrlError);
  });

  it('rejects empty and malformed input', () => {
    expect(() => normalizeGitLabBaseUrl('')).toThrow(GitLabUrlError);
    expect(() => normalizeGitLabBaseUrl('not a url')).toThrow(GitLabUrlError);
  });
});

describe('isSameOrigin', () => {
  it('compares scheme, host and port', () => {
    expect(isSameOrigin('https://gitlab.example.com/a', 'https://gitlab.example.com/b')).toBe(true);
    expect(isSameOrigin('https://gitlab.example.com', 'http://gitlab.example.com')).toBe(false);
    expect(isSameOrigin('https://gitlab.example.com', 'https://gitlab.example.com:8443')).toBe(false);
    expect(isSameOrigin('https://gitlab.example.com', 'https://gitlab.example.com.evil.io')).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isSameOrigin('nope', 'https://gitlab.example.com')).toBe(false);
  });
});

describe('resolveRedirectUrl', () => {
  it('resolves relative locations against the current URL', () => {
    expect(resolveRedirectUrl('/other/path', 'https://gitlab.example.com/api/v4/x').toString())
      .toBe('https://gitlab.example.com/other/path');
  });

  it('rejects unsafe redirect targets', () => {
    expect(() => resolveRedirectUrl('file:///etc/passwd', 'https://gitlab.example.com')).toThrow(GitLabUrlError);
    expect(() => resolveRedirectUrl('https://a:b@evil.example', 'https://gitlab.example.com')).toThrow(GitLabUrlError);
  });
});
