/**
 * @jest-environment node
 */
import {
  PROXY_ALLOWLIST,
  areSegmentsSafe,
  filterQueryParams,
  gitLabApiPathPrefix,
  matchProxyRoute,
  rewriteLinkHeader,
} from '@/lib/gitlab/proxy-allowlist';

const seg = (path: string) => path.split('/');

describe('proxy allowlist', () => {
  // Every endpoint the browser GitLabAPI client calls (src/lib/gitlab-api.ts),
  // excluding the unused downloadArtifact(), which moves to /api/artifacts/download.
  it.each([
    ['GET', 'projects'],
    ['GET', 'projects/12'],
    ['GET', 'projects/12/repository/branches'],
    ['GET', 'projects/12/repository/tags'],
    ['GET', 'projects/12/pipelines'],
    ['GET', 'projects/12/pipelines/345'],
    ['GET', 'projects/12/pipelines/345/jobs'],
    ['GET', 'projects/12/jobs'],
    ['GET', 'projects/12/jobs/678'],
    ['GET', 'projects/12/jobs/678/trace'],
    ['GET', 'projects/12/runners'],
    ['GET', 'projects/12/registry/repositories'],
    ['GET', 'projects/12/registry/repositories/9/tags'],
    ['GET', 'runners/all'],
    ['GET', 'runners/5'],
    ['GET', 'runners/5/jobs'],
    ['POST', 'projects/12/star'],
    ['POST', 'projects/12/unstar'],
    ['POST', 'projects/12/pipelines/345/retry'],
    ['POST', 'projects/12/pipelines/345/cancel'],
    ['POST', 'projects/12/jobs/678/retry'],
    ['POST', 'projects/12/jobs/678/cancel'],
    ['POST', 'projects/12/jobs/678/play'],
    ['DELETE', 'projects/12/jobs/678/artifacts'],
    ['DELETE', 'projects/12/registry/repositories/9'],
    ['DELETE', 'projects/12/registry/repositories/9/tags/latest'],
  ])('allows %s %s', (method, path) => {
    expect(matchProxyRoute(method, seg(path)).ok).toBe(true);
  });

  it('contains exactly the client endpoints', () => {
    expect(PROXY_ALLOWLIST).toHaveLength(26);
  });

  it.each([
    ['GET', 'projects/12/jobs/678/artifacts'],
    ['GET', 'projects/12/variables'],
    ['GET', 'user'],
    ['GET', 'users'],
    ['GET', 'projects/group-name'],
    ['GET', 'projects/0'],
    ['GET', 'projects/01'],
    ['GET', 'projects/99999999999999999999'],
    ['POST', 'projects'],
    ['DELETE', 'projects/12'],
    ['PUT', 'projects/12'],
  ])('rejects %s %s', (method, path) => {
    expect(matchProxyRoute(method, seg(path)).ok).toBe(false);
  });

  it('distinguishes unknown paths from wrong methods', () => {
    expect(matchProxyRoute('GET', seg('users'))).toEqual({ ok: false, reason: 'not_found' });
    expect(matchProxyRoute('PATCH', seg('projects/1/star'))).toEqual({
      ok: false,
      reason: 'method_not_allowed',
      allow: ['POST'],
    });
    expect(matchProxyRoute('GET', seg('projects/1/registry/repositories/2'))).toEqual({
      ok: false,
      reason: 'method_not_allowed',
      allow: ['DELETE'],
    });
  });

  it('restricts container tag names', () => {
    const tag = (t: string) => matchProxyRoute('DELETE', ['projects', '1', 'registry', 'repositories', '2', 'tags', t]).ok;
    expect(tag('v1.2.3-rc_1')).toBe(true);
    expect(tag('a'.repeat(128))).toBe(true);
    expect(tag('a'.repeat(129))).toBe(false);
    expect(tag('v1:latest')).toBe(false);
    expect(tag('v1?x')).toBe(false);
  });
});

describe('areSegmentsSafe', () => {
  it.each([[['projects', '1']], [['runners', 'all']]])('accepts %j', (s) => {
    expect(areSegmentsSafe(s)).toBe(true);
  });

  it.each([
    [[]],
    [['']],
    [['.']],
    [['..']],
    [['a/b']],
    [['a\\b']],
    [['%2e%2e']],
    [['a%2Fb']],
  ])('rejects %j', (s) => {
    expect(areSegmentsSafe(s)).toBe(false);
  });
});

describe('filterQueryParams', () => {
  it('keeps only allowed keys, preserves repeats and drops long values', () => {
    const out = filterQueryParams(
      new URLSearchParams(
        `page=2&per_page=20&private_token=a&access_token=b&job_token=c&scope[]=success&scope[]=failed&x=1&search=${'a'.repeat(300)}`
      )
    );
    expect(out.toString()).toBe('page=2&per_page=20&scope%5B%5D=success&scope%5B%5D=failed');
  });
});

describe('rewriteLinkHeader', () => {
  it('rewrites API links to the proxy path', () => {
    const link =
      '<https://gitlab.example.com/api/v4/projects/1/pipelines?page=2&per_page=20>; rel="next", ' +
      '<https://gitlab.example.com/api/v4/projects/1/pipelines?page=1&per_page=20>; rel="first"';
    expect(rewriteLinkHeader(link, 'https://gitlab.example.com')).toBe(
      '</api/gitlab/v4/projects/1/pipelines?page=2&per_page=20>; rel="next", ' +
        '</api/gitlab/v4/projects/1/pipelines?page=1&per_page=20>; rel="first"'
    );
  });

  it('honours a relative root and drops other paths and token params', () => {
    const link =
      '<https://other-host/gitlab/api/v4/projects?page=3&private_token=x>; rel="next", ' +
      '<https://gitlab.example.com/api/v4/projects?page=1>; rel="first", ' +
      '<https://gitlab.example.com/gitlab/api/v4/projects/..%2F..%2Fx>; rel="last"';
    expect(rewriteLinkHeader(link, 'https://gitlab.example.com/gitlab')).toBe(
      '</api/gitlab/v4/projects?page=3>; rel="next"'
    );
  });

  it('returns null when nothing is left', () => {
    expect(rewriteLinkHeader('<https://evil.example/x>; rel="next"', 'https://gitlab.example.com')).toBeNull();
    expect(rewriteLinkHeader('garbage', 'https://gitlab.example.com')).toBeNull();
  });

  it('computes the API path prefix', () => {
    expect(gitLabApiPathPrefix('https://gitlab.example.com')).toBe('/api/v4/');
    expect(gitLabApiPathPrefix('https://gitlab.example.com/gitlab')).toBe('/gitlab/api/v4/');
  });
});
