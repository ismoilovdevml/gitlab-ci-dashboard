import type { ContainerRepository, Job, Pipeline, Project, Runner } from '@/lib/gitlab-api';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function makeProject(overrides: Partial<Project> = {}): Project {
  const id = overrides.id ?? 1;
  return {
    id,
    name: `project-${id}`,
    name_with_namespace: `group / project-${id}`,
    path: `project-${id}`,
    path_with_namespace: `group/project-${id}`,
    description: '',
    web_url: `https://gitlab.example.com/group/project-${id}`,
    avatar_url: '',
    star_count: 0,
    forks_count: 0,
    last_activity_at: minutesAgo(5),
    created_at: minutesAgo(600),
    visibility: 'private',
    namespace: { id: 1, name: 'group', path: 'group', kind: 'group', full_path: 'group' },
    ...overrides,
  };
}

export function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  const id = overrides.id ?? 100;
  return {
    id,
    project_id: 1,
    status: 'success',
    ref: 'main',
    sha: `sha${id}abcdef`,
    web_url: `https://gitlab.example.com/group/project-1/-/pipelines/${id}`,
    created_at: minutesAgo(10),
    updated_at: minutesAgo(5),
    started_at: minutesAgo(10),
    finished_at: minutesAgo(5),
    duration: 300,
    user: { name: 'Dev', username: 'dev', avatar_url: '' },
    ...overrides,
  };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  const id = overrides.id ?? 1000;
  return {
    id,
    status: 'success',
    stage: 'build',
    name: `job-${id}`,
    ref: 'main',
    created_at: minutesAgo(10),
    started_at: minutesAgo(9),
    finished_at: minutesAgo(5),
    duration: 240,
    user: { name: 'Dev', username: 'dev', avatar_url: '' },
    commit: { id: 'abcdef123456', short_id: 'abcdef12', title: 'Commit title', author_name: 'Dev' },
    pipeline: { id: 100, project_id: 1, ref: 'main', sha: 'abcdef', status: 'success' },
    web_url: `https://gitlab.example.com/group/project-1/-/jobs/${id}`,
    project: { id: 1, name: 'project-1', name_with_namespace: 'group / project-1' },
    ...overrides,
  };
}

export function makeRunner(overrides: Partial<Runner> = {}): Runner {
  const id = overrides.id ?? 7;
  return {
    id,
    description: `runner-${id}`,
    ip_address: '10.0.0.1',
    active: true,
    paused: false,
    is_shared: false,
    runner_type: 'project_type',
    name: `runner-${id}`,
    online: true,
    status: 'online',
    contacted_at: minutesAgo(1),
    architecture: 'amd64',
    platform: 'linux',
    revision: 'abc',
    version: '17.0.0',
    access_level: 'not_protected',
    maximum_timeout: null,
    tag_list: ['docker'],
    run_untagged: true,
    locked: false,
    created_at: minutesAgo(1000),
    projects: [],
    ...overrides,
  };
}

export function makeRepository(overrides: Partial<ContainerRepository> = {}): ContainerRepository {
  const id = overrides.id ?? 5;
  return {
    id,
    name: `image-${id}`,
    path: `group/project-1/image-${id}`,
    project_id: 1,
    location: `registry.example.com/group/project-1/image-${id}`,
    created_at: minutesAgo(100),
    cleanup_policy_started_at: null,
    tags_count: 1,
    ...overrides,
  };
}

/** A promise whose settlement is controlled by the test. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
